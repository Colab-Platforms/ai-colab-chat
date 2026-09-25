import prisma from "@root/prisma.js";
import { uploadToCloudinary } from "@/utils/cloudinary.js";
import { debitTokens } from "@/utils/walletUtils.js";
import { dlog, dlogBlock, dlogError, dtime } from "./document.logger.js";
import { getRenderer } from "./document.renderers.js";
import { generateSpec } from "./document.spec.service.js";
import {
  DOCUMENT_FORMAT_META,
  FORMAT_SPEC_KIND,
  specKindOf,
  type AnySpec,
  type DocumentFormat,
  type DocumentSpec,
  type DocumentTheme,
  type PresentationSpec,
  type WorkbookSpec,
} from "./document.types.js";

const MAX_ATTEMPTS = Number(process.env.DOCUMENT_MAX_ATTEMPTS ?? 3);
const BATCH_SIZE = Number(process.env.DOCUMENT_BATCH_SIZE ?? 3);

const slugifyTitle = (title: string): string => {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    // Trimmed AFTER the cut, not before: slicing a long title can land on a
    // separator, which would otherwise leave a dangling "-" against the id.
    .replace(/^-+|-+$/g, "");
  return slug || "document";
};

/**
 * Cloudinary public_id for a rendered document.
 *
 * The row id is appended because the public_id is the file's identity in
 * Cloudinary: two documents sharing a title would otherwise overwrite each
 * other. Keying on the row id also means a retry of the SAME row deliberately
 * replaces its own earlier upload instead of leaking an orphan.
 */
const buildPublicId = (title: string, id: number): string =>
  `${slugifyTitle(title)}-${id}`;

/**
 * Claims a PENDING row for this worker.
 *
 * The guard on `status: "PENDING"` inside updateMany is what makes the claim
 * atomic — if two instances race, exactly one gets count === 1. The existing
 * crons in this app read-then-write and would double-process under horizontal
 * scaling; this one will not.
 */
const claimDocument = async (id: number): Promise<boolean> => {
  const { count } = await prisma.generatedDocument.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "PROCESSING", startedAt: new Date() },
  });
  return count === 1;
};

const failDocument = async (id: number, error: unknown): Promise<void> => {
  const message = String((error as any)?.message ?? error).slice(0, 1000);
  const current = await prisma.generatedDocument.findUnique({
    where: { id },
    select: { attempts: true },
  });

  const attempts = (current?.attempts ?? 0) + 1;
  // Below the cap the row goes back to PENDING so the next tick retries it;
  // at the cap it stays FAILED so we stop burning model spend on it.
  const exhausted = attempts >= MAX_ATTEMPTS;

  await prisma.generatedDocument.update({
    where: { id },
    data: {
      status: exhausted ? "FAILED" : "PENDING",
      attempts,
      lastError: message,
      ...(exhausted ? { completedAt: new Date() } : {}),
    },
  });

  dlogError(
    "worker",
    `job=${id} attempt=${attempts}/${MAX_ATTEMPTS} → ${exhausted ? "FAILED (giving up)" : "back to PENDING (will retry)"}`,
    message,
  );
};

export const processDocument = async (id: number): Promise<void> => {
  const claimed = await claimDocument(id);
  if (!claimed) {
    dlog("worker", `job=${id} already claimed by another worker — skipping`);
    return;
  }

  const jobStarted = Date.now();
  dlog("worker", `job=${id} CLAIMED (PENDING → PROCESSING)`);

  try {
    const document = await prisma.generatedDocument.findUnique({
      where: { id },
    });
    if (!document) {
      dlog("worker", `job=${id} vanished after claim — nothing to do`);
      return;
    }

    dlogBlock("worker", `job=${id} loaded`, {
      title: document.title,
      format: document.format,
      theme: document.theme,
      chatId: document.chatId,
      modelResponseId: document.modelResponseId,
      attempts: document.attempts,
      hasStoredSpec: Boolean(document.spec),
      promptChars: document.prompt.length,
      sourceTextChars: document.sourceText?.length ?? 0,
    });

    const format = document.format as DocumentFormat;
    const meta = DOCUMENT_FORMAT_META[format];
    const specKind = FORMAT_SPEC_KIND[format];

    // A spec already on the row means this is a re-render (retry, or a theme
    // change) — skip the model call and go straight to rendering.
    let spec = document.spec as unknown as AnySpec | null;
    let promptTokens = document.promptTokens;
    let completionTokens = document.completionTokens;

    if (!spec) {
      const generated = await dtime("worker", `job=${id} spec generation`, () =>
        generateSpec(specKind, document.prompt, document.sourceText),
      );
      spec = generated.spec;
      promptTokens = generated.promptTokens;
      completionTokens = generated.completionTokens;

      await prisma.generatedDocument.update({
        where: { id },
        data: {
          spec: spec as any,
          title: spec.title,
          promptTokens,
          completionTokens,
        },
      });

      // Metered once, on first generation only — a stored-spec re-render
      // (retry, theme change) makes no new model call, so it must not be
      // billed again. Real token counts, no multiplier.
      const billableTotal = (promptTokens ?? 0) + (completionTokens ?? 0);
      if (billableTotal > 0) {
        const wallet = await prisma.userWallet.findUnique({ where: { userId: document.userId } });
        if (wallet) {
          await prisma.$transaction((tx) =>
            debitTokens(tx, {
              userId: document.userId,
              walletId: wallet.id,
              amount: billableTotal,
              referenceId: `document_generation_${id}`,
              meta: { reason: "DOCUMENT_GENERATION", documentId: id, promptTokens, completionTokens },
            }),
          );
        } else {
          dlogError("worker", `job=${id} user=${document.userId} has no wallet — skipping debit`, null);
        }
      }
      dlog("worker", `job=${id} spec persisted — re-renders are now free`);
    } else {
      dlog("worker", `job=${id} reusing stored spec — no model call`);
    }

    const renderer = getRenderer(format);

    // Reached only if a row was written for a format with no renderer — the
    // enqueue paths resolve that away, so this is a wiring error rather than a
    // user-facing condition. Failing loudly beats emitting the wrong file type.
    if (!renderer) {
      throw new Error(
        `No renderer registered for format ${format}. Register one in document.renderers.ts.`,
      );
    }

    // A stored spec from an older row could be the wrong shape for this
    // format's renderer — check rather than trust, since the alternative is a
    // crash deep inside the renderer on a missing field.
    const storedKind = specKindOf(spec!);
    if (storedKind !== renderer.kind) {
      throw new Error(
        `Stored spec is a ${storedKind} spec but ${format} needs a ${renderer.kind} spec.`,
      );
    }

    const theme = document.theme as DocumentTheme;
    const fileBuffer = await dtime("worker", `job=${id} ${format} render`, () => {
      switch (renderer.kind) {
        case "presentation":
          return renderer.render(spec as PresentationSpec, theme);
        case "workbook":
          return renderer.render(spec as WorkbookSpec, theme);
        default:
          return renderer.render(spec as DocumentSpec, theme);
      }
    });

    // Named rather than left to Cloudinary's random id: this string becomes the
    // URL basename, and the URL basename is what the browser actually saves as
    // — the frontend's `download` attribute is ignored on a cross-origin link.
    const publicId = buildPublicId(spec.title, id);
    const fileName = `${publicId}.${meta.extension}`;

    const uploaded = await dtime("worker", `job=${id} Cloudinary upload`, () =>
      uploadToCloudinary(fileBuffer, {
        folder: "generated-documents",
        resourceType: "raw",
        format: meta.extension,
        publicId,
      }),
    );

    await prisma.generatedDocument.update({
      where: { id },
      data: {
        status: "COMPLETED",
        fileName,
        fileUrl: uploaded.url,
        cloudinaryPublicId: uploaded.publicId,
        fileSize: fileBuffer.length,
        lastError: null,
        completedAt: new Date(),
      },
    });

    dlogBlock("worker", `job=${id} COMPLETED in ${Date.now() - jobStarted}ms`, {
      fileName,
      format,
      fileSize: fileBuffer.length,
      fileUrl: uploaded.url,
      promptTokens,
      completionTokens,
    });
  } catch (error) {
    await failDocument(id, error);
  }
};

let isDraining = false;

/**
 * Drains the PENDING queue. Safe to call concurrently — overlapping calls
 * return immediately rather than double-processing, so the cron tick and the
 * post-enqueue kick can both invoke it freely.
 */
export const runPendingDocumentJobs = async (): Promise<void> => {
  if (isDraining) return;
  isDraining = true;

  try {
    const pending = await prisma.generatedDocument.findMany({
      where: { status: "PENDING", isDeleted: false, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      select: { id: true },
    });

    // Run the batch in parallel rather than one at a time: two users
    // generating at once should not queue behind each other. Actual
    // parallelism is bounded by the browser pool's semaphore, so this cannot
    // launch unbounded renders — and the atomic claim keeps it safe.
    await Promise.all(
      pending.map((document: { id: number }) => processDocument(document.id)),
    );
  } catch (error) {
    console.error("[document-generation] drain error:", error);
  } finally {
    isDraining = false;
  }
};
