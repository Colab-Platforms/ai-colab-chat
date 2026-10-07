import prisma from "@root/prisma.js";
import { deleteFromCloudinary, uploadToCloudinary } from "@/utils/cloudinary.js";
import { concatVideos } from "@/utils/videoStitch.js";
import { vlog, vlogBlock, vlogError } from "./video.logger.js";

const WORKING = new Set(["PENDING", "SUBMITTED"]);

const downloadClip = async (url: string): Promise<Buffer> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download a clip (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
};

/**
 * Looks at a sequence's clips and moves it forward: still rendering → nothing,
 * a clip failed → FAILED (so the UI can offer a per-clip retry), all clips
 * done → stitch them into the final video. Called every time a clip reaches a
 * terminal state or is retried, and safe to call repeatedly or concurrently.
 */
export const settleSequence = async (sequenceId: number): Promise<void> => {
  const sequence = await prisma.videoSequence.findFirst({
    where: { id: sequenceId, isDeleted: false },
    include: { clips: { where: { isDeleted: false }, orderBy: { sequenceOrder: "asc" } } },
  });
  if (!sequence || sequence.status === "STITCHING" || sequence.status === "COMPLETED") return;

  const { clips } = sequence;
  if (clips.some((c) => WORKING.has(c.status))) return;

  const failed = clips.find((c) => c.status !== "COMPLETED");
  if (failed || clips.length === 0) {
    await prisma.videoSequence.update({
      where: { id: sequenceId },
      data: { status: "FAILED", lastError: failed?.lastError ?? "A clip didn't finish generating" },
    });
    vlog("sequence", `seq=${sequenceId} FAILED — clip ${failed?.id} is ${failed?.status}`);
    return;
  }

  // Atomic claim — every clip's completion calls this, so exactly one caller
  // may run the stitch.
  const { count } = await prisma.videoSequence.updateMany({
    where: { id: sequenceId, status: { in: ["GENERATING", "FAILED"] } },
    data: { status: "STITCHING", lastError: null },
  });
  if (count !== 1) return;

  vlog("sequence", `seq=${sequenceId} all ${clips.length} clips done — stitching`);
  try {
    const buffers = await Promise.all(clips.map((c) => downloadClip(c.fileUrl!)));
    const stitched = await concatVideos(buffers);

    const uploaded = await uploadToCloudinary(stitched, {
      folder: "generated-videos",
      resourceType: "video",
      publicId: `sequence-${sequenceId}-${Date.now()}`,
    });

    const firstPrompt = clips[0].prompt.slice(0, 120);
    const finalVideo = await prisma.$transaction(async (tx) => {
      const created = await tx.generatedVideo.create({
        data: {
          userId: sequence.userId,
          chatId: sequence.chatId,
          modelId: sequence.modelId,
          status: "COMPLETED",
          prompt: `Image sequence (${clips.length} clips): ${firstPrompt}`,
          duration: clips.reduce((sum, c) => sum + c.duration, 0),
          resolution: sequence.resolution,
          aspectRatio: sequence.aspectRatio,
          fileUrl: uploaded.url,
          cloudinaryPublicId: uploaded.publicId,
          fileSize: stitched.length,
          // Informational only — the real charge was already taken per clip.
          reservedTokens: clips.reduce((sum, c) => sum + c.reservedTokens, 0),
          startedAt: sequence.createdAt,
          completedAt: new Date(),
          // Keeps the result where the request was made in the chat timeline.
          createdAt: sequence.createdAt,
        },
      });
      await tx.videoSequence.update({
        where: { id: sequenceId },
        data: { status: "COMPLETED", finalVideoId: created.id, lastError: null },
      });
      // Intermediate clips are no longer needed once stitched.
      await tx.generatedVideo.updateMany({
        where: { sequenceId },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      return created;
    });

    await Promise.all(
      clips
        .filter((c) => c.cloudinaryPublicId)
        .map((c) =>
          deleteFromCloudinary(c.cloudinaryPublicId!, "video").catch((error) =>
            vlogError("sequence", `seq=${sequenceId} couldn't remove clip asset ${c.id}`, error),
          ),
        ),
    );

    vlogBlock("sequence", `seq=${sequenceId} COMPLETED`, {
      finalVideoId: finalVideo.id,
      clips: clips.length,
      fileSize: stitched.length,
      fileUrl: uploaded.url,
    });
  } catch (error) {
    const message = String((error as any)?.message ?? error).slice(0, 1000);
    await prisma.videoSequence.update({
      where: { id: sequenceId },
      data: { status: "FAILED", lastError: `Couldn't combine the clips: ${message}` },
    });
    vlogError("sequence", `seq=${sequenceId} stitch failed`, message);
  }
};
