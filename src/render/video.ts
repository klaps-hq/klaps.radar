import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { detectBeats, type BeatGrid } from "../audio/beats";
import { musicFile, pickMood, sfxFile, type Mood } from "../audio/library";
import { MUSIC_PROMPTS } from "../audio/library";
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
const MIN_CARD_S = 1.8;
const MIN_BEATS = 2;
// The end card holds the music's tail after the final hit, up to this long.
const MAX_TAIL_S = 2.5;
const MIN_TAIL_S = 1.2;
// Background motion: a slow eased push-in across each scene, plus a short
// settle right after the cut so the cut itself has some energy.
const PUSH = 0.06;
const SETTLE = 0.05;
const SETTLE_S = 0.5;
const FLASH_S = 0.25;
const FLASH_ALPHA = 0.85;
// Constant light dim over posters so white text reads on bright artwork.
const POSTER_DIM = 0.18;

const beatsFor = (seconds: number, period: number) =>
  Math.max(MIN_BEATS, Math.ceil(seconds / period));

type Timeline = {
  scenes: Scene[];
  musicStart: number; // offset into the track at video time 0
  total: number;
  endAt: number; // video time of the end card (= the final hit)
};

// Beat plan for the content (hook + cards) on a track: whole beats per
// scene, cut on half beats for slow tracks so it fits before the ending.
const planBeats = (count: number, grid: BeatGrid) => {
  let period = grid.period;
  const plan = () => {
    const hookBeats = beatsFor(MIN_HOOK_S, period);
    const cardBeats = beatsFor(MIN_CARD_S, period);
    return { period, hookBeats, cardBeats, contentS: (hookBeats + count * cardBeats) * period };
  };
  let current = plan();
  while (current.contentS > grid.ending && period > 0.3) {
    period /= 2;
    current = plan();
  }
  return current;
};

// Picks the bed: the film's mood first (both variants), then any other bed
// whose ending leaves room for the whole line-up, so the end card can land
// on the final hit. Falls back to the bed with the most room.
const pickTrack = async (count: number, mood: Mood, preferred: 0 | 1) => {
  const moods = Object.keys(MUSIC_PROMPTS) as Mood[];
  const order: [Mood, 0 | 1][] = [
    [mood, preferred],
    [mood, (1 - preferred) as 0 | 1],
    ...moods.filter((m) => m !== mood).flatMap((m): [Mood, 0 | 1][] => [[m, 0], [m, 1]]),
  ];
  let best: { file: string; grid: BeatGrid; room: number } | null = null;
  for (const [m, v] of order) {
    const file = join(AUDIO_DIR, musicFile(m, v));
    const grid = await detectBeats(file);
    const room = grid.ending - planBeats(count, grid).contentS;
    if (room >= 0) return { file, grid };
    if (!best || room > best.room) best = { file, grid, room };
  }
  return { file: best!.file, grid: best!.grid };
};

// The timeline is anchored on the music's final hit: the end card starts
// exactly on it, and the hook and cards are laid out backwards from there
// in whole beats, so every cut sits on the beat and the song ends on the
// end card instead of being cut off. The music starts mid-track if needed.
const buildTimeline = (
  lineup: Screening[],
  hookLines: [string, string],
  posters: (Buffer | null)[],
  grid: BeatGrid
): Timeline => {
  const { period, hookBeats, cardBeats, contentS } = planBeats(lineup.length, grid);
  // If even the best track is too short, the music starts at 0 and the end
  // card follows the content (no longer exactly on the hit).
  const musicStart = Math.max(0, grid.ending - contentS);
  const endAt = contentS;
  const tail = Math.min(MAX_TAIL_S, Math.max(MIN_TAIL_S, grid.duration - grid.ending));

  const scenes: Scene[] = [];
  let t = 0;
  const span = (beats: number) => {
    const start = t;
    t += beats * period;
    return [start, t] as const;
  };
  const [hookStart, hookEnd] = span(hookBeats);
  scenes.push(hookScene(hookLines, hookStart, hookEnd, period));
  lineup.forEach((screening, i) => {
    const [start, end] = span(cardBeats);
    scenes.push(
      cardScene(screening, i, lineup.length, posters[i] ? i : null, start, end, period, i === 0)
    );
  });
  scenes.push(endScene(endAt, endAt + tail, period));

  return { scenes, musicStart, total: endAt + tail, endAt };
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

  const [posters, { file: music, grid: detected }] = await Promise.all([
    Promise.all(lineup.map(fetchReelPosterRaw)),
    pickTrack(lineup.length, mood, variant),
  ]);
  const { scenes, musicStart, total, endAt } = buildTimeline(
    lineup,
    hookLines,
    posters,
    detected
  );
  const frames = Math.round(total * FPS);
  const dropAt = scenes.find((s) => s.flash)?.start ?? 0;

  const dir = await mkdtemp(join(tmpdir(), "klaps-reel-"));
  try {
    const output = join(dir, "reel.mp4");
    const dropMs = Math.round(dropAt * 1000);
    const endMs = Math.round(endAt * 1000);
    const proc = Bun.spawn(
      [
        FFMPEG, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
        "-ss", musicStart.toFixed(3), "-i", music,
        "-i", join(AUDIO_DIR, sfxFile("impact")),
        "-i", join(AUDIO_DIR, sfxFile("impact")),
        "-filter_complex",
        [
          // The track's own ending carries the end card; only a short fade
          // in case its tail runs past the video.
          `[1:a]atrim=0:${total.toFixed(3)},afade=t=out:st=${(total - 0.25).toFixed(3)}:d=0.25,volume=${MUSIC_GAIN}[m]`,
          `[2:a]adelay=${dropMs}|${dropMs},volume=0.45[drop]`,
          // Reinforces the final hit under the end card.
          `[3:a]adelay=${endMs}|${endMs},volume=0.4[end]`,
          `[m][drop][end]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.95,aresample=44100[a]`,
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
