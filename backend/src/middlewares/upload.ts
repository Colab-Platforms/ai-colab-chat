import multer from "multer";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";

const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // PDF
  "application/pdf",
  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Text / Markdown
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  // PowerPoint
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Excel / CSV
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "text/csv",
  "application/csv",
];

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        "File type not supported. Allowed: images, PDF, PPT, Word, Excel, CSV.",
        STATUS_CODES.BAD_REQUEST,
      ),
    );
  }
};

/**
 * Multer middleware with memory storage.
 * Use as: upload.single('fieldName') or upload.array('fieldName', maxCount)
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Kept separate from ALLOWED_MIME_TYPES so the shared attachment upload
// (chat, voice, etc.) doesn't start accepting audio as a side effect.
const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
];

const audioFileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (AUDIO_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        "Audio type not supported. Allowed: MP3, WAV, M4A, AAC, OGG, WEBM.",
        STATUS_CODES.BAD_REQUEST,
      ),
    );
  }
};

/** Audio-only multer middleware — used for video reference audio. */
export const uploadAudio = multer({
  storage,
  fileFilter: audioFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});
