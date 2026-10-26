import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Screening } from "../types/types";
import {
  fetchScreeningImageBuffer,
  findHorizontalFocus,
  renderReelOverlay,
} from "./render";
import { LAYOUTS } from "./template";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const DURATION_S = 8;
const FPS = 30;
// The pan is computed at twice the output size and scaled down, so the
// crop moves in half-pixel steps and the motion stays smooth.
const SUPERSAMPLE = 2;
// Share of the image overflow the camera travels across, centred on the
// attention focus (faces, colour) rather than the middle of the frame.
const PAN_SPAN = 0.3;
const OVERLAY_FADE_START_S = 0.4;
const OVERLAY_FADE_S = 0.8;

// Reel: the backdrop pans slowly behind the reel overlay (scrims + text),
// which fades in after a beat. Silent stereo track, since some Instagram
// surfaces treat video without audio as broken.
export const renderScreeningReel = async (
  screening: Screening
): Promise<Buffer> => {
  const backdrop = await fetchScreeningImageBuffer(screening);
  if (!backdrop) {
    throw new Error("Reel needs a backdrop or poster image");
  }

  const { width, height } = LAYOUTS.reel;
  const w = width * SUPERSAMPLE;
  const h = height * SUPERSAMPLE;
  const dir = await mkdtemp(join(tmpdir(), "klaps-reel-"));

  try {
    const backdropPath = join(dir, "backdrop.jpg");
    const overlayPath = join(dir, "overlay.png");
    const outputPath = join(dir, "reel.mp4");
    await Bun.write(backdropPath, backdrop);
    await Bun.write(overlayPath, await renderReelOverlay(screening));

    const focus = await findHorizontalFocus(backdrop, { width: w, height: h });
    const panFrom = Math.min(1 - PAN_SPAN, Math.max(0, focus - PAN_SPAN / 2));
    const pan = `(iw-${w})*(${panFrom.toFixed(3)}+${PAN_SPAN}*t/${DURATION_S})`;
    const filter = [
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,` +
        `crop=${w}:${h}:x='${pan}':y='(ih-${h})/2',` +
        `scale=${width}:${height}:flags=lanczos,setsar=1[bg]`,
      `[1:v]format=rgba,fade=t=in:st=${OVERLAY_FADE_START_S}:d=${OVERLAY_FADE_S}:alpha=1[ov]`,
      `[bg][ov]overlay=0:0,format=yuv420p[v]`,
    ].join(";");

    const proc = Bun.spawn(
      [
        FFMPEG, "-y", "-loglevel", "error",
        "-loop", "1", "-framerate", String(FPS), "-t", String(DURATION_S), "-i", backdropPath,
        "-loop", "1", "-framerate", String(FPS), "-t", String(DURATION_S), "-i", overlayPath,
        "-f", "lavfi", "-t", String(DURATION_S), "-i", "anullsrc=r=44100:cl=stereo",
        "-filter_complex", filter,
        "-map", "[v]", "-map", "2:a",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", String(FPS),
        "-c:a", "aac", "-b:a", "128k",
        "-shortest", "-movflags", "+faststart",
        outputPath,
      ],
      { stderr: "pipe" }
    );

    if ((await proc.exited) !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`ffmpeg failed: ${stderr.trim().slice(0, 500)}`);
    }

    return Buffer.from(await Bun.file(outputPath).arrayBuffer());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
