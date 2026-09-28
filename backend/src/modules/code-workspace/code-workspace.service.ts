import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { languageFromPath, normalizeCodePath } from "./code-workspace.parser.js";
import {
  MAX_FILE_CHARS,
  MAX_FILES_PER_PROJECT,
  MAX_TITLE_CHARS,
  PREVIEWABLE_FRAMEWORKS,
  type CodeFileSnapshot,
  type CodeFramework,
} from "./code-workspace.types.js";

const projectSummarySelect = {
  id: true,
  chatId: true,
  title: true,
  framework: true,
  previewable: true,
  currentVersion: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const fileSelect = { path: true, language: true, content: true, updatedAt: true } as const;

function requirePath(raw: unknown): string {
  const path = typeof raw === "string" ? normalizeCodePath(raw) : null;
  if (!path) throw new ApiError("Invalid file path", STATUS_CODES.BAD_REQUEST);
  return path;
}

/* ------------------------------------------------------------------ *
 * Used by the chat stream (code-workspace.chat.ts)
 * ------------------------------------------------------------------ */

/** The project the chat is working on — the most recently touched one. */
export async function findActiveProject(chatId: number, userId: number) {
  return prisma.codeProject.findFirst({
    where: { chatId, userId, isDeleted: false },
    orderBy: { updatedAt: "desc" },
    select: { ...projectSummarySelect, files: { select: fileSelect, orderBy: { path: "asc" } } },
  });
}

export async function createProject(params: {
  userId: number;
  chatId: number;
  title: string;
  framework: CodeFramework;
}) {
  return prisma.codeProject.create({
    data: {
      userId: params.userId,
      chatId: params.chatId,
      title: params.title.slice(0, MAX_TITLE_CHARS) || "Code Project",
      framework: params.framework,
      previewable: PREVIEWABLE_FRAMEWORKS.has(params.framework),
      status: "GENERATING",
    },
    select: projectSummarySelect,
  });
}

export async function setProjectStatus(projectId: number, status: "GENERATING" | "READY" | "FAILED") {
  await prisma.codeProject.update({ where: { id: projectId }, data: { status } });
}

/** AI write — no ownership check (the chat turn already verified the chat). */
export async function writeFile(projectId: number, path: string, content: string) {
  await prisma.codeFile.upsert({
    where: { projectId_path: { projectId, path } },
    create: { projectId, path, language: languageFromPath(path), content: content.slice(0, MAX_FILE_CHARS) },
    update: { content: content.slice(0, MAX_FILE_CHARS), language: languageFromPath(path) },
  });
}

export async function removeFile(projectId: number, path: string) {
  await prisma.codeFile.deleteMany({ where: { projectId, path } });
}

/**
 * Cheap lookup run on every Software Engineer turn: paths only. File
 * contents are loaded separately, and only for turns that need them.
 */
export async function findActiveProjectSummary(chatId: number, userId: number) {
  return prisma.codeProject.findFirst({
    where: { chatId, userId, isDeleted: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, framework: true, files: { select: { path: true }, orderBy: { path: "asc" } } },
  });
}

export async function readFiles(projectId: number): Promise<CodeFileSnapshot[]> {
  return prisma.codeFile.findMany({
    where: { projectId },
    select: { path: true, language: true, content: true },
    orderBy: { path: "asc" },
  });
}

/**
 * Records the project's current files as the next version. Also refreshes
 * `previewable` from the files that actually exist — a "react" project the
 * model wrote without a package.json/index.html cannot run in Sandpack.
 */
export async function snapshotVersion(
  projectId: number,
  source: "AI" | "USER" | "RESTORE",
  extra: { modelResponseId?: number | null; plan?: string | null; changedPaths?: string[] } = {},
) {
  const files = await readFiles(projectId);
  return prisma.$transaction(async (tx) => {
    const project = await tx.codeProject.findUniqueOrThrow({
      where: { id: projectId },
      select: { currentVersion: true, framework: true },
    });
    const version = project.currentVersion + 1;
    await tx.codeProjectVersion.create({
      data: {
        projectId,
        version,
        source,
        modelResponseId: extra.modelResponseId ?? null,
        plan: extra.plan?.slice(0, 4000) || null,
        changedPaths: extra.changedPaths ?? [],
        filesSnapshot: files as any,
      },
    });
    const paths = new Set(files.map((f) => f.path));
    const runnable =
      PREVIEWABLE_FRAMEWORKS.has(project.framework as CodeFramework) &&
      (paths.has("index.html") || paths.has("public/index.html") || paths.has("package.json"));
    await tx.codeProject.update({
      where: { id: projectId },
      data: { currentVersion: version, dirtySinceSnapshot: false, previewable: runnable },
    });
    return version;
  });
}

/** Before an AI edit: keep the user's own editor changes as a restorable version. */
export async function snapshotUserEditsIfDirty(projectId: number) {
  const project = await prisma.codeProject.findUnique({
    where: { id: projectId },
    select: { dirtySinceSnapshot: true },
  });
  if (project?.dirtySinceSnapshot) await snapshotVersion(projectId, "USER");
}

/* ------------------------------------------------------------------ *
 * REST (code-workspace.controller.ts) — every call checks ownership
 * ------------------------------------------------------------------ */

async function requireProject(userId: number, projectId: number) {
  const project = await prisma.codeProject.findFirst({
    where: { id: projectId, userId, isDeleted: false },
    select: { id: true, status: true, _count: { select: { files: true } } },
  });
  if (!project) throw new ApiError("Project not found", STATUS_CODES.NOT_FOUND);
  return project;
}

function assertNotGenerating(status: string) {
  if (status === "GENERATING") {
    throw new ApiError("The AI is still writing this project — try again when it finishes", STATUS_CODES.CONFLICT);
  }
}

async function markDirty(projectId: number) {
  await prisma.codeProject.update({ where: { id: projectId }, data: { dirtySinceSnapshot: true } });
}

export async function getProject(userId: number, projectId: number) {
  const project = await prisma.codeProject.findFirst({
    where: { id: projectId, userId, isDeleted: false },
    select: { ...projectSummarySelect, files: { select: fileSelect, orderBy: { path: "asc" } } },
  });
  if (!project) throw new ApiError("Project not found", STATUS_CODES.NOT_FOUND);
  return project;
}

export async function saveFile(userId: number, projectId: number, rawPath: unknown, content: string) {
  const project = await requireProject(userId, projectId);
  assertNotGenerating(project.status);
  const path = requirePath(rawPath);
  const exists = await prisma.codeFile.findUnique({ where: { projectId_path: { projectId, path } }, select: { id: true } });
  if (!exists && project._count.files >= MAX_FILES_PER_PROJECT) {
    throw new ApiError(`A project can have at most ${MAX_FILES_PER_PROJECT} files`, STATUS_CODES.BAD_REQUEST);
  }
  await writeFile(projectId, path, content);
  await markDirty(projectId);
  return { path, language: languageFromPath(path) };
}

export async function deleteFile(userId: number, projectId: number, rawPath: unknown) {
  const project = await requireProject(userId, projectId);
  assertNotGenerating(project.status);
  const path = requirePath(rawPath);
  // Deleting a folder deletes everything under it.
  await prisma.codeFile.deleteMany({
    where: { projectId, OR: [{ path }, { path: { startsWith: `${path}/` } }] },
  });
  await markDirty(projectId);
  return { path };
}

export async function renameFile(userId: number, projectId: number, rawFrom: unknown, rawTo: unknown) {
  const project = await requireProject(userId, projectId);
  assertNotGenerating(project.status);
  const from = requirePath(rawFrom);
  const to = requirePath(rawTo);
  if (from === to) return { from, to };

  const files = await prisma.codeFile.findMany({
    where: { projectId, OR: [{ path: from }, { path: { startsWith: `${from}/` } }] },
    select: { id: true, path: true },
  });
  if (files.length === 0) throw new ApiError("File not found", STATUS_CODES.NOT_FOUND);

  const renamed = files.map((f) => ({ id: f.id, path: to + f.path.slice(from.length) }));
  const clash = await prisma.codeFile.findFirst({
    where: { projectId, path: { in: renamed.map((r) => r.path) }, id: { notIn: files.map((f) => f.id) } },
    select: { path: true },
  });
  if (clash) throw new ApiError(`${clash.path} already exists`, STATUS_CODES.CONFLICT);

  await prisma.$transaction(
    renamed.map((r) =>
      prisma.codeFile.update({ where: { id: r.id }, data: { path: r.path, language: languageFromPath(r.path) } }),
    ),
  );
  await markDirty(projectId);
  return { from, to };
}

export async function renameProject(userId: number, projectId: number, title: string) {
  await requireProject(userId, projectId);
  return prisma.codeProject.update({
    where: { id: projectId },
    data: { title: title.slice(0, MAX_TITLE_CHARS) },
    select: projectSummarySelect,
  });
}

export async function listVersions(userId: number, projectId: number) {
  await requireProject(userId, projectId);
  const versions = await prisma.codeProjectVersion.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true, source: true, modelResponseId: true, createdAt: true, filesSnapshot: true },
  });
  return versions.map(({ filesSnapshot, ...v }) => ({
    ...v,
    fileCount: Array.isArray(filesSnapshot) ? filesSnapshot.length : 0,
  }));
}

/**
 * Makes an old version current again. Non-destructive: unsaved-to-version
 * edits are snapshotted first, and the restore itself becomes a new version,
 * so the user can always get back to where they were.
 */
export async function restoreVersion(userId: number, projectId: number, version: number) {
  const project = await requireProject(userId, projectId);
  assertNotGenerating(project.status);
  const target = await prisma.codeProjectVersion.findUnique({
    where: { projectId_version: { projectId, version } },
    select: { filesSnapshot: true },
  });
  if (!target) throw new ApiError("Version not found", STATUS_CODES.NOT_FOUND);

  await snapshotUserEditsIfDirty(projectId);
  const files = (Array.isArray(target.filesSnapshot) ? target.filesSnapshot : []) as unknown as CodeFileSnapshot[];
  await prisma.$transaction([
    prisma.codeFile.deleteMany({ where: { projectId } }),
    prisma.codeFile.createMany({
      data: files.map((f) => ({ projectId, path: f.path, language: f.language, content: f.content })),
    }),
  ]);
  await snapshotVersion(projectId, "RESTORE");
  return getProject(userId, projectId);
}

export async function deleteProject(userId: number, projectId: number) {
  await requireProject(userId, projectId);
  await prisma.codeProject.update({ where: { id: projectId }, data: { isDeleted: true } });
  return { id: projectId };
}
