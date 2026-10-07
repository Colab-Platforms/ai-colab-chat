import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

// FFMPEG_PATH wins so a deployment can point at a system ffmpeg; otherwise the
// binary bundled by ffmpeg-static is used, so no server install is required.
const ffmpegBinary = (): string => {
  const bin = process.env.FFMPEG_PATH || ffmpegStatic;
  if (!bin) throw new Error("No ffmpeg binary available — install ffmpeg-static or set FFMPEG_PATH");
  return bin;
};

const FPS = 30;

/** Runs ffmpeg to completion; resolves with stderr (where ffmpeg prints stream info), rejects on a non-zero exit. */
const runFfmpeg = (args: string[], { allowFailure = false } = {}): Promise<string> =>
  new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBinary(), args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0 || allowFailure) resolve(stderr);
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`));
    });
  });

/** `ffmpeg -i file` with no output exits non-zero but still prints the stream layout — enough to read size and audio presence without ffprobe. */
const inspect = async (file: string): Promise<{ width: number; height: number; hasAudio: boolean }> => {
  const info = await runFfmpeg(["-hide_banner", "-i", file], { allowFailure: true });
  const size = info.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/);
  return {
    width: size ? Number(size[1]) : 1280,
    height: size ? Number(size[2]) : 720,
    hasAudio: /Stream #\d+:\d+.*Audio:/.test(info),
  };
};

const even = (n: number) => n - (n % 2);

/**
 * Concatenates MP4 buffers in the given order into one MP4.
 *
 * Clips from different models (or even the same one) can differ in codec
 * parameters and some have no audio track, so a bare `-c copy` concat is
 * unreliable. Each clip is first re-encoded to an identical layout — same
 * size, frame rate, pixel format and a stereo AAC track (silent when the
 * source had none) — and only then joined losslessly.
 */
export const concatVideos = async (clips: Buffer[]): Promise<Buffer> => {
  if (clips.length === 0) throw new Error("concatVideos needs at least one clip");
  if (clips.length === 1) return clips[0];

  const dir = await mkdtemp(path.join(tmpdir(), "video-stitch-"));
  try {
    const inputs: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const file = path.join(dir, `in-${i}.mp4`);
      await writeFile(file, clips[i]);
      inputs.push(file);
    }

    // Everything is normalised to the first clip's frame size.
    const { width, height } = await inspect(inputs[0]);
    const w = even(width);
    const h = even(height);

    const normalised: string[] = [];
    for (let i = 0; i < inputs.length; i++) {
      const { hasAudio } = await inspect(inputs[i]);
      const out = path.join(dir, `norm-${i}.mp4`);
      const videoFilter =
        `scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
        `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},format=yuv420p`;

      await runFfmpeg([
        "-y",
        "-i", inputs[i],
        ...(hasAudio ? [] : ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]),
        "-map", "0:v:0",
        "-map", hasAudio ? "0:a:0" : "1:a:0",
        "-vf", videoFilter,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-ar", "44100", "-ac", "2",
        "-shortest",
        "-movflags", "+faststart",
        out,
      ]);
      normalised.push(out);
    }

    const listFile = path.join(dir, "list.txt");
    // The concat demuxer's quoting rules: wrap in single quotes, escape any inside.
    await writeFile(
      listFile,
      normalised.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"),
    );

    const outFile = path.join(dir, "out.mp4");
    await runFfmpeg([
      "-y",
      "-f", "concat", "-safe", "0",
      "-i", listFile,
      "-c", "copy",
      "-movflags", "+faststart",
      outFile,
    ]);

    return await readFile(outFile);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};
