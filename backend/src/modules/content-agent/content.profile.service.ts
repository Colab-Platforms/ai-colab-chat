import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";

/** Brand kit + product CRUD. folderId null = user-global scope. */

const assertFolder = async (userId: number, folderId?: number | null) => {
  if (!folderId) return null;
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, userId, isDeleted: false },
    select: { id: true },
  });
  if (!folder) throw new ApiError("Folder not found", STATUS_CODES.NOT_FOUND);
  return folder.id;
};

// ── Brand kit (one per scope) ─────────────────────────────────────────────

export interface BrandKitInput {
  name: string;
  voice?: string;
  audience?: string;
  bannedWords?: string[];
  mustInclude?: string[];
  ctaRules?: string | null;
  examples?: string[];
}

export async function getBrandKit(userId: number, folderId?: number | null) {
  return prisma.brandKit.findFirst({
    where: { userId, folderId: folderId ?? null, isDeleted: false },
  });
}

export async function upsertBrandKit(
  userId: number,
  folderIdRaw: number | null | undefined,
  data: BrandKitInput,
) {
  const folderId = await assertFolder(userId, folderIdRaw);
  const existing = await getBrandKit(userId, folderId);
  const fields = {
    name: data.name,
    voice: data.voice ?? "",
    audience: data.audience ?? "",
    bannedWords: data.bannedWords ?? [],
    mustInclude: data.mustInclude ?? [],
    ctaRules: data.ctaRules ?? null,
    examples: (data.examples ?? []) as any,
  };
  return existing
    ? prisma.brandKit.update({ where: { id: existing.id }, data: fields })
    : prisma.brandKit.create({ data: { userId, folderId, ...fields } });
}

export async function deleteBrandKit(userId: number, id: number) {
  const { count } = await prisma.brandKit.updateMany({
    where: { id, userId, isDeleted: false },
    data: { isDeleted: true },
  });
  if (!count) throw new ApiError("Brand kit not found", STATUS_CODES.NOT_FOUND);
}

// ── Products ─────────────────────────────────────────────────────────────

export interface ProductInput {
  name: string;
  summary?: string;
  features?: string[];
  pricing?: string | null;
  claimsAllowed?: string[];
  claimsForbidden?: string[];
}

export async function listProducts(userId: number, folderId?: number | null) {
  return prisma.product.findMany({
    where: {
      userId,
      isDeleted: false,
      ...(folderId === undefined ? {} : { folderId }),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function createProduct(
  userId: number,
  folderIdRaw: number | null | undefined,
  data: ProductInput,
) {
  const folderId = await assertFolder(userId, folderIdRaw);
  return prisma.product.create({
    data: {
      userId,
      folderId,
      name: data.name,
      summary: data.summary ?? "",
      features: (data.features ?? []) as any,
      pricing: data.pricing ?? null,
      claimsAllowed: (data.claimsAllowed ?? []) as any,
      claimsForbidden: (data.claimsForbidden ?? []) as any,
    },
  });
}

export async function updateProduct(
  userId: number,
  id: number,
  data: ProductInput,
) {
  const existing = await prisma.product.findFirst({
    where: { id, userId, isDeleted: false },
  });
  if (!existing) throw new ApiError("Product not found", STATUS_CODES.NOT_FOUND);
  return prisma.product.update({
    where: { id },
    data: {
      name: data.name,
      summary: data.summary ?? "",
      features: (data.features ?? []) as any,
      pricing: data.pricing ?? null,
      claimsAllowed: (data.claimsAllowed ?? []) as any,
      claimsForbidden: (data.claimsForbidden ?? []) as any,
    },
  });
}

export async function deleteProduct(userId: number, id: number) {
  const { count } = await prisma.product.updateMany({
    where: { id, userId, isDeleted: false },
    data: { isDeleted: true },
  });
  if (!count) throw new ApiError("Product not found", STATUS_CODES.NOT_FOUND);
}
