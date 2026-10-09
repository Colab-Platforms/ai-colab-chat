import prisma from "@root/prisma.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import ChatService from "@/modules/chat/chat.service.js";
import DocumentService from "@/modules/document/document.service.js";
import { findVoiceSummaryContext } from "./voice-memory.service.js";
import { extractAttachmentText } from "./voice-attachment.service.js";

dayjs.extend(utc);
dayjs.extend(timezone);

function timeOfDayFor(userTimezone: string): "morning" | "afternoon" | "evening" | "night" {
  const hour = dayjs().tz(userTimezone).hour();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

interface VoiceSessionResult {
  roomUrl: string;
  token: string;
  chatId: number;
}

const chatService = new ChatService();
const documentService = new DocumentService();

export default class VoiceService {
  private get baseUrl(): string {
    return process.env.VOICE_AGENT_URL || "http://localhost:7860";
  }

  // Same shared secret used in both directions: Node -> voice-agent when
  // minting a session, and voice-agent -> Node when it calls back for
  // history/context or to persist a completed turn.
  private get internalToken(): string {
    return process.env.VOICE_AGENT_INTERNAL_TOKEN || "";
  }

  async createSession(
    userId: number,
    voiceId?: string,
    chatId?: number,
    attachmentIds?: number[],
  ): Promise<VoiceSessionResult> {
    if (!this.internalToken) {
      const err: any = new Error("Voice service is not configured");
      err.statusCode = 503;
      throw err;
    }

    let resolvedChatId = chatId;
    if (resolvedChatId) {
      const chat = await prisma.chat.findFirst({
        where: { id: resolvedChatId, userId, isDeleted: false },
        select: { id: true },
      });
      if (!chat) {
        throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);
      }
    } else {
      const chat = await chatService.create(userId, {
        title: "Voice Chat",
        capability: "VOICE",
      });
      resolvedChatId = chat.id;

      // Not GLOBAL, so chatService.create()'s default-context linking never
      // picks this up on its own (deliberately — see voice-memory.service.ts)
      // — link it explicitly, only for voice chats, only if the nightly job
      // has produced one yet.
      const voiceMemory = await findVoiceSummaryContext(userId);
      if (voiceMemory) {
        await prisma.chatContext.create({
          data: { chatId: resolvedChatId, contextId: voiceMemory.id },
        });
      }
    }

    if (attachmentIds && attachmentIds.length > 0) {
      await this.attachDocuments(resolvedChatId, attachmentIds);
    }

    // Caller (browser) never sends a voiceId today — fall back to the
    // user's saved preference so the voice they picked in Settings applies
    // without every call site needing to know about it. voice-agent's own
    // env default still applies if the user has never picked one either.
    let resolvedVoiceId = voiceId;
    if (!resolvedVoiceId) {
      const preference = await prisma.userPreference.findUnique({
        where: { userId },
        select: { voiceId: true },
      });
      resolvedVoiceId = preference?.voiceId ?? undefined;
    }

    const response = await fetch(`${this.baseUrl}/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": this.internalToken,
      },
      body: JSON.stringify({ userId, voiceId: resolvedVoiceId, chatId: resolvedChatId }),
    });

    if (!response.ok) {
      const err: any = new Error(`Voice service returned ${response.status}`);
      err.statusCode = 502;
      throw err;
    }

    const data = (await response.json()) as { roomUrl: string; token: string };
    return { roomUrl: data.roomUrl, token: data.token, chatId: resolvedChatId };
  }

  /** Extracts text from documents attached in the pre-call upload screen and
   * folds each into this chat's contextText via ChatContext — same
   * CUSTOM/per-chat-linked shape as the voice-memory summary above, so it
   * never leaks into other chats and doesn't touch `history` (keeping the
   * new-chat proactive-greeting check in bot.py unaffected). Images are
   * skipped — extractAttachmentText returns null for them. */
  private async attachDocuments(chatId: number, attachmentIds: number[]) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { userId: true },
    });
    if (!chat) return;

    const attachments = await prisma.attachment.findMany({
      where: { id: { in: attachmentIds } },
    });

    for (const attachment of attachments) {
      const text = await extractAttachmentText({
        fileUrl: attachment.fileUrl,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      });
      if (!text) continue;

      const context = await prisma.contextMemory.create({
        data: {
          userId: chat.userId,
          type: "CUSTOM",
          origin: "SYSTEM",
          isAutoSelected: false,
          sourceChatId: chatId,
          title: attachment.fileName,
          memory: text,
        },
      });

      await prisma.chatContext.create({
        data: { chatId, contextId: context.id },
      });
    }
  }

  /** Called by voice-agent (not the browser) when a bot process starts, to
   * seed the LLM with this chat's prior turns plus the same personalisation
   * memory text-chat uses — so voice picks up mid-conversation and knows the
   * user's context, not just a bare system prompt every call. */
  async getContextForChat(chatId: number) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, isDeleted: false },
      select: { id: true, userId: true },
    });
    if (!chat) {
      throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);
    }

    const [messages, contextLinks, user] = await Promise.all([
      prisma.message.findMany({
        where: { chatId, isDeleted: false },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      }),
      prisma.chatContext.findMany({
        where: { chatId, context: { userId: chat.userId, isDeleted: false } },
        include: { context: true },
      }),
      prisma.user.findUnique({
        where: { id: chat.userId },
        select: { firstName: true, timezone: true },
      }),
    ]);

    const history = messages
      .filter((m) => m.content && m.content.trim().length > 0)
      .map((m) => ({
        role: m.role === "ASSISTANT" ? "assistant" : "user",
        content: m.content,
      }));

    const contextStrings = contextLinks.map((link) => link.context.memory);
    const contextText =
      contextStrings.length > 0
        ? `User context (personalisation — always keep in mind):\n${contextStrings.map((c) => `- ${c}`).join("\n")}`
        : "";

    return {
      history,
      contextText,
      userFirstName: user?.firstName ?? null,
      timeOfDay: timeOfDayFor(user?.timezone || "Asia/Kolkata"),
    };
  }

  /** Called by voice-agent after each completed turn (user transcript or
   * assistant reply) so the call shows up as normal chat history — same
   * Chat/Message tables the rest of the product already uses. */
  async appendMessage(chatId: number, role: "USER" | "ASSISTANT", content: string) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, isDeleted: false },
      select: { id: true },
    });
    if (!chat) {
      throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);
    }

    const message = await prisma.message.create({
      data: { chatId, role, content, chatType: "VOICE" },
    });

    const messageCount = await prisma.message.count({ where: { chatId } });
    if (messageCount === 1 && role === "USER") {
      await prisma.chat.update({
        where: { id: chatId },
        data: { title: content.trim().substring(0, 60) },
      });
    } else {
      await prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      });
    }

    return message;
  }

  /** Called by voice-agent when the LLM invokes the generate_document tool
   * mid-call. Reuses the exact same enqueue path the text-chat "generate a
   * PDF" flow uses (document.service.ts) — the renderer/worker don't know or
   * care that the request came from voice instead of typed chat. Returns
   * immediately with a PENDING row; the caller keeps talking while it
   * renders in the background. */
  async generateDocument(chatId: number, prompt: string, format?: string) {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, isDeleted: false },
      select: { id: true, userId: true },
    });
    if (!chat) {
      throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);
    }

    return documentService.create(chat.userId, {
      chatId,
      prompt,
      format: format as any,
    });
  }
}
