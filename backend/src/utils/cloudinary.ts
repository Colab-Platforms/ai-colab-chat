import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

// CLOUDINARY_URL env var is auto-parsed by the SDK
cloudinary.config();

interface UploadResult {
  url: string;
  publicId: string;
  moderationStatuses?: string[];
  bytes?: number;
  width?: number;
  height?: number;
}

export interface UploadOptions {
  folder?: string;
  resourceType?: "image" | "raw" | "auto" | "video";
  format?: string;
  quality?: string;
  moderation?: string;
  /**
   * Explicit Cloudinary public_id (relative to `folder`, no extension).
   *
   * Worth setting for anything a user downloads: browsers ignore the `download`
   * attribute on cross-origin links, so the saved filename is always the URL's
   * basename — which is Cloudinary's random id unless we name it here.
   * Must be unique per file, since a repeat overwrites the earlier upload.
   */
  publicId?: string;
}

const normalizeModerationStatuses = (
  moderationData: unknown,
): string[] | undefined => {
  if (!Array.isArray(moderationData)) return undefined;
  const statuses = moderationData
    .map((entry: any) =>
      typeof entry?.status === "string" ? entry.status.toLowerCase() : null,
    )
    .filter((status: string | null): status is string => Boolean(status));
  return statuses.length > 0 ? statuses : undefined;
};

/**
 * Upload a file (Buffer from multer) or a direct URL to Cloudinary.
 * Defaults to the `ai-colab-chat` folder; pass `options.folder` to override.
 */
export const uploadToCloudinary = async (
  file: Buffer | string,
  options: UploadOptions = {},
): Promise<UploadResult> => {
  const {
    folder = "ai-colab-chat",
    resourceType = "auto",
    format,
    quality,
    moderation,
    publicId,
  } = options;

  if (typeof file === "string") {
    const result = await cloudinary.uploader.upload(file, {
      folder,
      resource_type: resourceType,
      format,
      quality,
      moderation,
      ...(publicId ? { public_id: publicId, overwrite: true } : {}),
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      moderationStatuses: normalizeModerationStatuses((result as any).moderation),
      bytes: result.bytes,
      width: result.width,
      height: result.height,
    };
  } else {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          format,
          quality,
          moderation,
          ...(publicId ? { public_id: publicId, overwrite: true } : {}),
        },
        (error, result?: UploadApiResponse) => {
          if (error || !result)
            return reject(error || new Error("Upload failed"));
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            moderationStatuses: normalizeModerationStatuses(
              (result as any).moderation,
            ),
            bytes: result.bytes,
            width: result.width,
            height: result.height,
          });
        },
      );
      stream.end(file);
    });
  }
};

/**
 * Delete a file from Cloudinary by its public ID.
 *
 * `resourceType` must match what the asset was uploaded with — Cloudinary
 * namespaces destroy() by resource type, so deleting a "video" or "raw"
 * upload without passing it here silently does nothing (`image` is the
 * SDK's own default).
 */
export const deleteFromCloudinary = async (
  publicId: string,
  resourceType: "image" | "raw" | "video" = "image",
): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

/**
 * Extract publicId from a Cloudinary URL
 */
export const extractPublicId = (url: string): string | null => {
  try {
    const matches = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-zA-Z0-9]+$/);
    return matches ? matches[1] : null;
  } catch (e) {
    return null;
  }
};
