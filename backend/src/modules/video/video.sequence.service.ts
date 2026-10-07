import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { deleteFromCloudinary } from "@/utils/cloudinary.js";
import VideoService, {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_DURATION,
  DEFAULT_RESOLUTION,
} from "./video.service.js";
import { refundReservation, runPendingVideoJobs } from "./video.generation.service.js";
import { settleSequence } from "./video.sequence.settle.js";
import { vlog, vlogError } from "./video.logger.js";
import { type CreateVideoInput, type CreateVideoSequenceInput } from "./video.types.js";

const videoService = new VideoService();

const CLIP_SELECT = {
  id: true,
  sequenceOrder: true,
  status: true,
  prompt: true,
  duration: true,
  firstFrameUrl: true,
  lastFrameUrl: true,
  lastError: true,
} as const;

/**
 * Turns an ordered list of images (each with its own prompt) into one video:
 * every image becomes its own clip through the normal single-video pipeline —
 * so billing, retries and refunds are all per-clip and unchanged — and once
 * every clip has landed they're stitched together in order (see
 * video.sequence.settle.ts).
 */
class VideoSequenceService {
  async create(userId: number, input: CreateVideoSequenceInput) {
    const { images, smoothTransitions = false } = input;

    if (input.chatId) {
      const chat = await prisma.chat.findFirst({
        where: { id: input.chatId, userId, isDeleted: false },
        select: { id: true },
      });
      if (!chat) throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);
    }

    const model = await videoService.resolveModel(input.modelId);
    const duration = input.duration ?? DEFAULT_DURATION;
    const resolution = input.resolution ?? DEFAULT_RESOLUTION;
    const aspectRatio = input.aspectRatio ?? DEFAULT_ASPECT_RATIO;

    const clipInputs: CreateVideoInput[] = smoothTransitions
      ? images.slice(0, -1).map((image, i) => ({
          prompt: image.prompt,
          firstFrameUrl: image.imageUrl,
          lastFrameUrl: images[i + 1].imageUrl,
        }))
      : images.map((image) => ({ prompt: image.prompt, firstFrameUrl: image.imageUrl }));

    const sequence = await prisma.videoSequence.create({
      data: {
        userId,
        chatId: input.chatId ?? null,
        modelId: model.id,
        smoothTransitions,
        resolution,
        aspectRatio,
      },
    });
    vlog("sequence", `seq=${sequence.id} user=${userId} creating ${clipInputs.length} clips (smooth=${smoothTransitions})`);

    const createdIds: number[] = [];
    try {
      for (let i = 0; i < clipInputs.length; i++) {
        const clip = await videoService.create(
          userId,
          {
            ...clipInputs[i],
            chatId: input.chatId,
            modelId: model.id,
            duration,
            resolution,
            aspectRatio,
          },
          { sequenceId: sequence.id, sequenceOrder: i, deferKick: true },
        );
        createdIds.push(clip.id);
      }
    } catch (error) {
      // All-or-nothing: a sequence with a missing clip can never stitch, so
      // give back whatever was already reserved (e.g. the user ran out of
      // credits on clip 4 of 6) and discard the sequence.
      await this.cancelPendingClips(createdIds);
      await prisma.videoSequence.update({ where: { id: sequence.id }, data: { isDeleted: true } });
      vlogError("sequence", `seq=${sequence.id} creation failed — rolled back ${createdIds.length} clip(s)`, error);
      throw error;
    }

    void runPendingVideoJobs();
    return this.getById(userId, sequence.id);
  }

  /** In-progress and failed sequences — a finished one is represented by its stitched GeneratedVideo instead. */
  async list(userId: number, query: { chatId?: number | string }) {
    return prisma.videoSequence.findMany({
      where: {
        userId,
        isDeleted: false,
        status: { not: "COMPLETED" },
        ...(query.chatId ? { chatId: Number(query.chatId) } : {}),
      },
      orderBy: { createdAt: "asc" },
      include: { clips: { where: { isDeleted: false }, orderBy: { sequenceOrder: "asc" }, select: CLIP_SELECT } },
    });
  }

  async getById(userId: number, id: number) {
    const sequence = await prisma.videoSequence.findFirst({
      where: { id, userId, isDeleted: false },
      include: {
        // Once stitched, the clips are soft-deleted — the progress view only
        // needs them while the sequence is still in flight.
        clips: { where: { isDeleted: false }, orderBy: { sequenceOrder: "asc" }, select: CLIP_SELECT },
        finalVideo: true,
      },
    });
    if (!sequence) throw new ApiError("Video sequence not found", STATUS_CODES.NOT_FOUND);
    return sequence;
  }

  /**
   * Re-runs whatever stopped a FAILED sequence: failed clips are retried
   * (re-debiting, same as retrying a single video), or — if every clip is
   * actually fine and only the stitch failed — the stitch is simply re-run.
   */
  async retry(userId: number, id: number) {
    const sequence = await this.getById(userId, id);
    if (sequence.status !== "FAILED") {
      throw new ApiError("Only failed sequences can be retried", STATUS_CODES.BAD_REQUEST);
    }

    const failedClips = sequence.clips.filter((c) => c.status === "FAILED");
    if (failedClips.length > 0) {
      for (const clip of failedClips) {
        await videoService.retry(userId, clip.id);
      }
    } else if (sequence.clips.every((c) => c.status === "COMPLETED")) {
      await prisma.videoSequence.update({ where: { id }, data: { status: "GENERATING", lastError: null } });
      void settleSequence(id);
    } else {
      throw new ApiError("This sequence has no clips that can be retried", STATUS_CODES.BAD_REQUEST);
    }
    return this.getById(userId, id);
  }

  async delete(userId: number, id: number) {
    const sequence = await this.getById(userId, id);
    await this.cancelPendingClips(sequence.clips.map((c) => c.id));

    const clips = await prisma.generatedVideo.findMany({
      where: { sequenceId: id },
      select: { cloudinaryPublicId: true },
    });
    await Promise.all(
      clips
        .filter((c) => c.cloudinaryPublicId)
        .map((c) =>
          deleteFromCloudinary(c.cloudinaryPublicId!, "video").catch((error) =>
            vlogError("sequence", `seq=${id} couldn't remove a clip asset`, error),
          ),
        ),
    );

    await prisma.$transaction([
      prisma.generatedVideo.updateMany({
        where: { sequenceId: id },
        data: { isDeleted: true, deletedAt: new Date() },
      }),
      prisma.videoSequence.update({ where: { id }, data: { isDeleted: true } }),
    ]);
    return { id };
  }

  /**
   * Cancels clips that haven't been handed to the provider yet and refunds
   * their reservations. A clip already submitted can't be recalled, so it's
   * left to finish on its own.
   */
  private async cancelPendingClips(clipIds: number[]): Promise<void> {
    for (const clipId of clipIds) {
      const { count } = await prisma.generatedVideo.updateMany({
        where: { id: clipId, status: "PENDING" },
        data: { status: "CANCELLED", completedAt: new Date(), lastError: "Cancelled" },
      });
      if (count !== 1) continue;

      const clip = await prisma.generatedVideo.findUnique({ where: { id: clipId } });
      if (clip) await refundReservation(clip);
    }
  }
}

export default VideoSequenceService;
