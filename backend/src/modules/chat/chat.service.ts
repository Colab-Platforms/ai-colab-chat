import prisma from "@root/prisma.js";
import { v4 as uuidv4 } from "uuid";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { CreateChatBody } from "./chat.types.js";
import {
  getPaginationOptions,
  formatPaginationResponse,
} from "@/utils/paginationUtils.js";
import { buildPrismaQuery } from "prisma-qb";

class ChatService {
  private async getDefaultContextIdsForChat(userId: number, folderId?: number | null) {
    const globalContextsQuery = prisma.contextMemory.findMany({
      where: { userId, type: "GLOBAL", isAutoSelected: true, isDeleted: false },
      select: { id: true },
    });

    const folderContextsQuery = folderId
      ? prisma.contextMemory.findMany({
        where: { userId, type: "FOLDER", folderId, isDeleted: false },
        select: { id: true },
      })
      : Promise.resolve([]);

    const [globalContexts, folderContexts] = await Promise.all([
      globalContextsQuery,
      folderContextsQuery,
    ]);

    return Array.from(
      new Set([
        ...globalContexts.map((ctx) => ctx.id),
        ...folderContexts.map((ctx) => ctx.id),
      ]),
    );
  }

  private async assertChatOwnership(userId: number, chatId: number) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
      select: { id: true, folderId: true },
    });

    if (!chat) {
      throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);
    }

    return chat;
  }

  async create(userId: number, data: CreateChatBody) {
    if (data.folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: data.folderId, userId, isDeleted: false },
      });
      if (!folder)
        throw new ApiError("Folder not found", STATUS_CODES.NOT_FOUND);
    }

    if (data.assistantId) {
      const assistant = await prisma.assistant.findFirst({
        where: { id: data.assistantId, isActive: true, isDeleted: false },
      });
      if (!assistant)
        throw new ApiError(
          "Assistant not found or inactive",
          STATUS_CODES.NOT_FOUND,
        );
    }

    const chat = await prisma.chat.create({
      data: {
        title: data.title,
        userId,
        folderId: data.folderId ?? null,
        assistantId: data.assistantId ?? null,
        modelIds: data.modelIds ?? [],
        capability: (data.capability as any) ?? "STANDARD",
      },
    });

    const defaultContextIds = await this.getDefaultContextIdsForChat(
      userId,
      chat.folderId,
    );
    if (defaultContextIds.length > 0) {
      await prisma.chatContext.createMany({
        data: defaultContextIds.map((contextId) => ({
          chatId: chat.id,
          contextId,
        })),
      });
    }

    return chat;
  }

  async list(userId: number, query: any) {
    const { take, skip, page, pageSize } = getPaginationOptions(query, 20);

    const { where: qbWhere, orderBy } = buildPrismaQuery({
      query,
      searchFields: [{ field: "title" }],
      filterFields: [
        { key: "folderId", field: "folderId", type: "number" },
        { key: "isArchived", field: "isArchived", type: "boolean" },
        { key: "capability", field: "capability", type: "string" },
      ],
      sortFields: [
        { key: "updatedAt", field: "updatedAt" },
        { key: "createdAt", field: "createdAt" },
        { key: "title", field: "title" },
      ],
      defaultSort: { key: "updatedAt", order: "desc" },
      softDelete: { field: "isDeleted", value: false },
      allowedQueryKeys: ["page", "pageSize"],
    });

    const where: any = { ...qbWhere, userId };

    if (query.folderId === 'null') {
      where.folderId = null;
    }

    // Voice chats live in their own tab (see voice.service.ts / /voice
    // page) and shouldn't clutter the regular sidebar/chat list — only
    // include them when explicitly requested via ?capability=VOICE.
    if (!query.capability) {
      where.capability = { not: "VOICE" };
    }

    const [chats, totalRecords] = await Promise.all([
      prisma.chat.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          assistant: { select: { id: true, name: true, icon: true } },
          _count: { select: { messages: true } },
        },
      }),
      prisma.chat.count({ where }),
    ]);

    return formatPaginationResponse(chats, totalRecords, page, pageSize);
  }

  async getById(userId: number, chatId: number) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
      include: {
        generatedDocuments: {
          where: { isDeleted: false },
          select: {
            id: true,
            status: true,
            format: true,
            title: true,
            fileName: true,
            fileUrl: true,
            fileSize: true,
            lastError: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        messages: {
          where: { isDeleted: false },
          orderBy: { createdAt: "asc" },
          include: {
            attachments: true,
            modelResponses: {
              include: {
                model: { select: { id: true, name: true, externalId: true } },
                // Generation outlives the SSE stream, so a document must come
                // back with the chat — otherwise a refresh mid-generation
                // loses the card entirely.
                generatedDocuments: {
                  where: { isDeleted: false },
                  select: {
                    id: true,
                    status: true,
                    format: true,
                    title: true,
                    fileName: true,
                    fileUrl: true,
                    fileSize: true,
                    lastError: true,
                  },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!chat) throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);

    // Heal existing chats or handle deactivated models
    const hasNoModels = !chat.modelIds || chat.modelIds.length === 0;

    let activeModelIdsSet = new Set<number>();
    if (!hasNoModels) {
      const activeModels = await prisma.model.findMany({
        where: {
          id: { in: chat.modelIds },
          isActive: true,
          isDeleted: false,
          capabilities: { has: chat.capability }
        },
        select: { id: true },
      });
      activeModelIdsSet = new Set(activeModels.map((m) => m.id));
    }

    const hasMissingModel = hasNoModels || (chat.modelIds && chat.modelIds.some((id) => !activeModelIdsSet.has(id)));

    if (hasMissingModel) {
      let updatedModelIds = (chat.modelIds || []).filter((id) => activeModelIdsSet.has(id));

      if (updatedModelIds.length === 0) {
        // 1. Try to find models from chat history (most accurate for existing chats)
        const lastAssistantMsg = chat.messages
          .filter((m) => m.role === "ASSISTANT")
          .pop();

        if (lastAssistantMsg && lastAssistantMsg.modelResponses && lastAssistantMsg.modelResponses.length > 0) {
          const historyModelIds = [...new Set(lastAssistantMsg.modelResponses.map((mr: any) => mr.model?.id))]
            .filter((id): id is number => !!id);

          const validHistoryModels = await prisma.model.findMany({
            where: {
              id: { in: historyModelIds },
              isActive: true,
              isDeleted: false,
              capabilities: { has: chat.capability }
            },
            select: { id: true },
          });
          updatedModelIds = validHistoryModels.map(m => m.id);
        }

        // 2. If history is empty or invalid, find the default model for the capability
        if (updatedModelIds.length === 0) {
          const defaultModel = await prisma.model.findFirst({
            where: {
              isActive: true,
              isDeleted: false,
              defaultForCapabilities: { has: chat.capability },
            },
            select: { id: true },
          });

          if (defaultModel) {
            updatedModelIds = [defaultModel.id];
          } else {
            const anyActive = await prisma.model.findFirst({
              where: { isActive: true, isDeleted: false },
              select: { id: true },
            });
            if (anyActive) updatedModelIds = [anyActive.id];
          }
        }
      }

      // Persist the correction back to the DB
      if (JSON.stringify(updatedModelIds) !== JSON.stringify(chat.modelIds)) {
        await prisma.chat.update({
          where: { id: chatId },
          data: { modelIds: updatedModelIds },
        });
        chat.modelIds = updatedModelIds;
      }
    }

    return chat;
  }

  async update(
    userId: number,
    chatId: number,
    data: {
      title?: string;
      folderId?: number | null;
      assistantId?: number | null;
      modelIds?: number[];
      capability?: string;
    },
  ) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });

    if (!chat) throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);

    if (data.folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: data.folderId, userId, isDeleted: false },
      });
      if (!folder)
        throw new ApiError("Folder not found", STATUS_CODES.NOT_FOUND);
    }

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: {
        ...data,
        capability: data.capability ? (data.capability as any) : undefined,
      },
    });

    return updated;
  }

  async archive(userId: number, chatId: number) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });

    if (!chat) throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: { isArchived: !chat.isArchived },
    });

    return updated;
  }

  async pin(userId: number, chatId: number) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });

    if (!chat) throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: { isPinned: !chat.isPinned },
    });

    return updated;
  }

  async share(userId: number, chatId: number) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });

    if (!chat) throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: {
        isShared: true,
        shareId: chat.shareId ?? uuidv4(),
        sharedAt: chat.sharedAt ?? new Date(),
      },
    });

    return updated;
  }

  async getShared(shareId: string) {
    const chat = await prisma.chat.findFirst({
      where: { shareId, isShared: true, isDeleted: false },
      include: {
        messages: {
          where: { isDeleted: false },
          orderBy: { createdAt: "asc" },
          include: {
            attachments: true,
            modelResponses: {
              include: { model: { select: { id: true, name: true } } },
            },
          },
        },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!chat)
      throw new ApiError("Shared chat not found", STATUS_CODES.NOT_FOUND);

    return chat;
  }

  async feedback(userId: number, responseId: number, isLiked: boolean | null) {
    const response = await prisma.modelResponse.findFirst({
      where: { id: responseId },
      include: { chat: { select: { userId: true, isDeleted: true } } },
    });

    if (
      !response ||
      response.chat.userId !== userId ||
      response.chat.isDeleted
    ) {
      throw new ApiError("Response not found", STATUS_CODES.NOT_FOUND);
    }

    const updated = await prisma.modelResponse.update({
      where: { id: responseId },
      data: { isLiked },
    });

    return updated;
  }

  async getContexts(userId: number, chatId: number) {
    await this.assertChatOwnership(userId, chatId);

    const links = await prisma.chatContext.findMany({
      where: { chatId, context: { isDeleted: false, userId } },
      include: { context: true },
      orderBy: { createdAt: "asc" },
    });

    const selectedContexts = links.map((link) => link.context);

    return {
      contextIds: selectedContexts.map((ctx) => ctx.id),
      contexts: selectedContexts,
    };
  }

  async replaceContexts(userId: number, chatId: number, contextIds: number[]) {
    await this.assertChatOwnership(userId, chatId);

    const uniqueIds = Array.from(new Set(contextIds));
    // Always preserve system-generated contexts (e.g. "My Name") even if the
    // client tries to remove them via the context picker.
    const systemGeneratedIds = (
      await prisma.contextMemory.findMany({
        where: { userId, isDeleted: false, isAutoGenerated: true },
        select: { id: true },
      })
    ).map((ctx) => ctx.id);
    const mergedIds = Array.from(new Set([...uniqueIds, ...systemGeneratedIds]));

    if (mergedIds.length > 0) {
      const allowedContexts = await prisma.contextMemory.findMany({
        where: {
          id: { in: mergedIds },
          userId,
          isDeleted: false,
        },
        select: { id: true },
      });

      if (allowedContexts.length !== mergedIds.length) {
        throw new ApiError(
          "One or more contexts are invalid for this user",
          STATUS_CODES.BAD_REQUEST,
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.chatContext.deleteMany({ where: { chatId } });

      if (mergedIds.length > 0) {
        await tx.chatContext.createMany({
          data: mergedIds.map((contextId) => ({ chatId, contextId })),
        });
      }
    });

    return this.getContexts(userId, chatId);
  }

  async softDelete(userId: number, chatId: number) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId, isDeleted: false },
    });

    if (!chat) throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);

    await prisma.chat.update({
      where: { id: chatId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    return { message: "Chat deleted successfully" };
  }
}

export default ChatService;
