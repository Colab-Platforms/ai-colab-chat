import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { deleteFromCloudinary } from "@/utils/cloudinary.js";
import type { ListImagesQuery } from "./image.types.js";

const DEFAULT_LIMIT = 20;

class ImageService {
  async list(userId: number, query: ListImagesQuery) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_LIMIT, 1), 100);

    const where = {
      userId,
      isDeleted: false,
      ...(query.chatId ? { chatId: Number(query.chatId) } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.generatedImage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.generatedImage.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(userId: number, id: number) {
    const image = await prisma.generatedImage.findFirst({
      where: { id, userId, isDeleted: false },
    });
    if (!image) {
      throw new ApiError("Image not found", STATUS_CODES.NOT_FOUND);
    }
    return image;
  }

  async delete(userId: number, id: number) {
    const image = await prisma.generatedImage.findFirst({
      where: { id, userId, isDeleted: false },
      select: { id: true, cloudinaryPublicId: true },
    });
    if (!image) {
      throw new ApiError("Image not found", STATUS_CODES.NOT_FOUND);
    }

    if (image.cloudinaryPublicId) {
      await deleteFromCloudinary(image.cloudinaryPublicId, "image").catch((error) => {
        console.error(`[image.delete] job=${id} failed to delete Cloudinary asset`, error);
      });
    }

    const result = await prisma.generatedImage.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
      select: { id: true },
    });
    return result;
  }
}

export default ImageService;
