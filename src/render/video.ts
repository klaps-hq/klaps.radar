import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { detectBeats } from "../audio/beats";
import { musicFile, pickMood, sfxFile } from "../audio/library";
import type { Screening } from "../types/types";
import {
  cardScene,
  easeInOutSine,
  easeOutCubic,
  endScene,
  H,
  hookScene,
  renderTextLayer,
  textSignature,
  W,
  type Scene,
} from "./kinetic";
import { fetchReelPosterRaw, REEL_POSTER_SIZE } from "./render";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const AUDIO_DIR = fileURLToPath(new URL("../../assets/audio/", import.meta.url));
const FPS = 30;
const MUSIC_GAIN = 0.9;
// Scene lengths are whole beats, at least this long so the text can land
// and be read.
const MIN_HOOK_S = 1.6;
const MIN_CARD_S = 2.0;
const MIN_END_S = 1.6;
// Longer than this and the reel drags; slow tracks (often detected at half
// tempo) are cut on half beats instead.
const MAX_REEL_S = 14;
// Background motion: a slow eased push-in across each scene, plus a short
// settle right after the cut so the cut itself has some energy.
const PUSH = 0.06;
const SETTLE = 0.05;
const SETTLE_S = 0.5;
const FLASH_S = 0.25;
const FLASH_ALPHA = 0.85;
// Constant light dim over posters so white text reads on bright artwork.
const POSTER_DIM = 0.18;

// Beat times relative to the first beat, halved for slow tracks and
// extended with the period past the end of the detected grid.
const beatClock = (detected: { beats: number[]; period: number }) => {
  let times = detected.beats.map((b) => b - (detected.beats[0] ?? 0));
  let period = detected.period;
  return {
    get period() {
      return period;
    },
    halve() {
      times = times.flatMap((t) => [t, t + period / 2]);
      period /= 2;
    },
    at(index: number): number {
      const last = times.length - 1;
      return index <= last ? times[index]! : (times[last] ?? 0) + (index - last) * period;
    },
  };
};

const beatsFor = (seconds: number, period: number) =>
  Math.max(2, Math.ceil(seconds / period));

const buildScenes = (
  lineup: Screening[],
  hookLines: [string, string],
  posters: (Buffer | null)[],
  clock: ReturnType<typeof beatClock>
): Scene[] => {
  const period = clock.period;
  const scenes: Scene[] = [];
  let beat = 0;
  const span = (beats: number) => {
    const start = clock.at(beat);
    beat += beats;
    return [start, clock.at(beat)] as const;
  };

  const [hookStart, hookEnd] = span(beatsFor(MIN_HOOK_S, period));
  scenes.push(hookScene(hookLines, hookStart, hookEnd, period));
  lineup.forEach((screening, i) => {
    const [start, end] = span(beatsFor(MIN_CARD_S, period));
    scenes.push(
      cardScene(screening, i, lineup.length, posters[i] ? i : null, start, end, period, i === 0)
    );
  });
  const [endStart, endEnd] = span(beatsFor(MIN_END_S, period));
  scenes.push(endScene(endStart, endEnd, period));
  return scenes;
};

// Poster frame at time t: centred crop that pushes in slowly with an
// ease, plus the post-cut settle, resized to the output frame.
const backgroundAt = (poster: Buffer | null, scene: Scene, t: number): Promise<Buffer> => {
  if (!poster) return Promise.resolve(Buffer.alloc(W * H * 3));
  const p = (t - scene.start) / (scene.end - scene.start);
  const zoom =
    1 + PUSH * easeInOutSine(p) + SETTLE * (1 - easeOutCubic((t - scene.start) / SETTLE_S));
  const { width: pw, height: ph } = REEL_POSTER_SIZE;
  const width = Math.round(pw / zoom);
  const height = Math.round(ph / zoom);
  return sharp(poster, { raw: { width: pw, height: ph, channels: 3 } })
    .extract({
      left: Math.round((pw - width) / 2),
      top: Math.round((ph - height) / 2),
      width,
      height,
    })
    .resize(W, H, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
};

// Line-up reel: the screenings in `lineup` as poster scenes with kinetic
// text, timed to the beats of a music bed matched to `moodSource` (the
// top-scored screening). Frames are rendered one by one and streamed to
// ffmpeg, which muxes them with the music.
export const renderLineupReel = async (
  lineup: Screening[],
  hookLines: [string, string],
  moodSource: Screening
): Promise<Buffer> => {
  const genreIds = (moodSource.movie.movies_genres ?? []).map((g) => g.genreId);
  const mood = pickMood(genreIds, moodSource.movie.productionYear);
  const variant = (moodSource.movie.title.length % 2) as 0 | 1;
  const music = join(AUDIO_DIR, musicFile(mood, variant));

  const [posters, detected] = await Promise.all([
    Promise.all(lineup.map(fetchReelPosterRaw)),
    detectBeats(music),
  ]);
  const clock = beatClock(detected);
  let scenes = buildScenes(lineup, hookLines, posters, clock);
  while (scenes.at(-1)!.end > MAX_REEL_S && clock.period > 0.25) {
    clock.halve();
    scenes = buildScenes(lineup, hookLines, posters, clock);
  }
  const total = scenes.at(-1)!.end;
  const frames = Math.round(total * FPS);
  const dropAt = scenes.find((s) => s.flash)?.start ?? 0;

  const dir = await mkdtemp(join(tmpdir(), "klaps-reel-"));
  try {
    const output = join(dir, "reel.mp4");
    const dropMs = Math.round(dropAt * 1000);
    const proc = Bun.spawn(
      [
        FFMPEG, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
        "-ss", (detected.beats[0] ?? 0).toFixed(3), "-i", music,
        "-i", join(AUDIO_DIR, sfxFile("impact")),
        "-filter_complex",
        [
          `[1:a]atrim=0:${total.toFixed(3)},afade=t=out:st=${(total - 0.4).toFixed(3)}:d=0.4,volume=${MUSIC_GAIN}[m]`,
          `[2:a]adelay=${dropMs}|${dropMs},volume=0.5[hit]`,
          `[m][hit]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95,aresample=44100[a]`,
        ].join(";"),
        "-map", "0:v", "-map", "[a]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-maxrate", "6M", "-bufsize", "12M", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ac", "2",
        "-t", total.toFixed(3), "-movflags", "+faststart",
        output,
      ],
      { stdin: "pipe", stderr: "pipe" }
    );

    let cachedSignature = "";
    let cachedText: Buffer | null = null;
    for (let frame = 0; frame < frames; frame += 1) {
      const t = frame / FPS;
      const scene = scenes.find((s) => t < s.end) ?? scenes.at(-1)!;

      const signature = `${scenes.indexOf(scene)}#${textSignature(scene, t)}`;
      if (signature !== cachedSignature) {
        cachedText = await renderTextLayer(scene, t);
        cachedSignature = signature;
      }

      const layers: sharp.OverlayOptions[] = [
        ...(scene.poster === null
          ? []
          : [{ input: { create: { width: W, height: H, channels: 4 as const, background: { r: 0, g: 0, b: 0, alpha: POSTER_DIM } } } }]),
        { input: cachedText!, raw: { width: W, height: H, channels: 4 } },
      ];
      if (scene.flash && t - scene.start < FLASH_S) {
        const alpha = FLASH_ALPHA * (1 - easeOutCubic((t - scene.start) / FLASH_S));
        layers.push({
          input: { create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha } } },
        });
      }

      const background = await backgroundAt(
        scene.poster === null ? null : posters[scene.poster] ?? null,
        scene,
        t
      );
      const composed = await sharp(background, { raw: { width: W, height: H, channels: 3 } })
        .composite(layers)
        .removeAlpha()
        .raw()
        .toBuffer();
      proc.stdin.write(composed);
      await proc.stdin.flush();
    }
    await proc.stdin.end();

    if ((await proc.exited) !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`ffmpeg failed: ${stderr.trim().slice(0, 800)}`);
    }
    return Buffer.from(await Bun.file(output).arrayBuffer());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
