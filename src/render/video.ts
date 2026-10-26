import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { detectBeats, type BeatGrid } from "../audio/beats";
import { MUSIC_PROMPTS, musicFile, pickMood, sfxFile, type Mood } from "../audio/library";
import type { Screening } from "../types/types";
import {
  anniversaryCardScene,
  anniversaryHookScene,
  CARD_SIZE,
  cardScene,
  easeInOutSine,
  endScene,
  H,
  hookScene,
  renderBase,
  renderTextLayer,
  textSignature,
  W,
  type Scene,
} from "./kinetic";
import { fetchReelPosterUrl } from "./render";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const AUDIO_DIR = fileURLToPath(new URL("../../assets/audio/", import.meta.url));
const FPS = 30;
const MUSIC_GAIN = 0.9;
// Scene lengths are whole beats, at least this long so the block can be
// read after its lines have faded up.
const MIN_HOOK_S = 2.0;
const MIN_CARD_S = 2.4;
const MIN_BEATS = 2;
// The end card holds the music's tail after the final hit, up to this long.
const MAX_TAIL_S = 2.5;
const MIN_TAIL_S = 1.5;
// Each card dissolves into the next, starting on the beat.
const DISSOLVE_S = 0.4;

// Nearest whole number of beats, but never under 90% of the target, so
// a slightly slow tempo does not add almost a whole extra beat per card.
const beatsFor = (seconds: number, period: number) => {
  let beats = Math.max(MIN_BEATS, Math.round(seconds / period));
  while (beats * period < seconds * 0.9) beats += 1;
  return beats;
};

// A scene of the reel before it is timed: the shortest it may be, and how
// to build it once its start and end are known.
export type SceneSpec = {
  minS: number;
  make: (start: number, end: number) => Scene;
};

// Beat plan for the content scenes on a track: whole beats per scene, on
// half beats for slow tracks so the content fits before the ending.
const planBeats = (specs: SceneSpec[], grid: BeatGrid) => {
  let period = grid.period;
  const plan = () => {
    const beats = specs.map((spec) => beatsFor(spec.minS, period));
    return { period, beats, contentS: beats.reduce((sum, n) => sum + n, 0) * period };
  };
  let current = plan();
  while (current.contentS > grid.ending && period > 0.3) {
    period /= 2;
    current = plan();
  }
  return current;
};

// Picks the bed: the film's mood first (both variants), then any other bed
// whose ending leaves room for all the scenes, so the end card can land on
// the final hit. Falls back to the bed with the most room.
const pickTrack = async (specs: SceneSpec[], mood: Mood, preferred: 0 | 1) => {
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
    const room = grid.ending - planBeats(specs, grid).contentS;
    if (room >= 0) return { file, grid };
    if (!best || room > best.room) best = { file, grid, room };
  }
  return { file: best!.file, grid: best!.grid };
};

type Timeline = {
  scenes: Scene[];
  musicStart: number; // offset into the track at video time 0
  total: number;
  endAt: number; // video time of the end card (= the final hit)
};

// The timeline is anchored on the music's final hit: the end card starts
// exactly on it, and the content scenes are laid out backwards from there
// in whole beats, so every change of card sits on the beat and the song
// ends on the end card. The music starts mid-track if needed.
const buildTimeline = (
  specs: SceneSpec[],
  grid: BeatGrid,
  endImage: string | null
): Timeline => {
  const { period, beats, contentS } = planBeats(specs, grid);
  // If even the best track is too short, the music starts at 0 and the end
  // card follows the content (no longer exactly on the hit).
  const musicStart = Math.max(0, grid.ending - contentS);
  const endAt = contentS;
  const tail = Math.min(MAX_TAIL_S, Math.max(MIN_TAIL_S, grid.duration - grid.ending));

  const scenes: Scene[] = [];
  let t = 0;
  specs.forEach((spec, i) => {
    const start = t;
    t += beats[i]! * period;
    scenes.push(spec.make(start, t));
  });
  scenes.push(endScene(endAt, endAt + tail, endImage));

  return { scenes, musicStart, total: endAt + tail, endAt };
};

// a * (1 - k) + b * k over two raw RGB frames.
const blend = (a: Buffer, b: Buffer, k: number): Buffer => {
  const out = Buffer.allocUnsafe(a.length);
  const ka = 1 - k;
  for (let i = 0; i < a.length; i += 1) out[i] = a[i]! * ka + b[i]! * k;
  return out;
};

// Renders a reel of klaps cards (poster held still, one text block)
// dissolving into each other on the beats of a music bed matched to
// `moodSource`, ending on the bed's final hit. Frames are rendered one by
// one and streamed to ffmpeg, which muxes the music.
const renderReel = async (
  specs: SceneSpec[],
  moodSource: Screening,
  endImage: string | null
): Promise<Buffer> => {
  const genreIds = (moodSource.movie.movies_genres ?? []).map((g) => g.genreId);
  const mood = pickMood(genreIds, moodSource.movie.productionYear);
  const variant = (moodSource.movie.title.length % 2) as 0 | 1;
  const { file: music, grid } = await pickTrack(specs, mood, variant);
  const { scenes, musicStart, total, endAt } = buildTimeline(specs, grid, endImage);
  const bases = await Promise.all(scenes.map(renderBase));
  const frames = Math.round(total * FPS);

  const dir = await mkdtemp(join(tmpdir(), "klaps-reel-"));
  try {
    const output = join(dir, "reel.mp4");
    const endMs = Math.round(endAt * 1000);
    const proc = Bun.spawn(
      [
        FFMPEG, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
        "-ss", musicStart.toFixed(3), "-i", music,
        "-i", join(AUDIO_DIR, sfxFile("impact")),
        "-filter_complex",
        [
          // The track's own ending carries the end card; only a short fade
          // in case its tail runs past the video.
          `[1:a]atrim=0:${total.toFixed(3)},afade=t=out:st=${(total - 0.25).toFixed(3)}:d=0.25,volume=${MUSIC_GAIN}[m]`,
          // A soft hit under the end card, on the music's final hit.
          `[2:a]adelay=${endMs}|${endMs},volume=0.3[end]`,
          `[m][end]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95,aresample=44100[a]`,
        ].join(";"),
        "-map", "0:v", "-map", "[a]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "19",
        "-maxrate", "6M", "-bufsize", "12M", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ac", "2",
        "-t", total.toFixed(3), "-movflags", "+faststart",
        output,
      ],
      { stdin: "pipe", stderr: "pipe" }
    );

    let cachedKey = "";
    let cachedFrame: Buffer | null = null;
    let sceneIndex = 0;
    let previousFinal: Buffer | null = null;
    for (let frame = 0; frame < frames; frame += 1) {
      const t = frame / FPS;
      while (sceneIndex < scenes.length - 1 && t >= scenes[sceneIndex]!.end) {
        // The last full frame of the outgoing card is what dissolves away.
        previousFinal = cachedFrame;
        sceneIndex += 1;
      }
      const scene = scenes[sceneIndex]!;

      const key = `${sceneIndex}#${textSignature(scene, t)}`;
      if (key !== cachedKey) {
        const text = await renderTextLayer(scene, t);
        cachedFrame = await sharp(bases[sceneIndex]!, { raw: { width: W, height: H, channels: 3 } })
          .composite([{ input: text, raw: { width: W, height: H, channels: 4 } }])
          .removeAlpha()
          .raw()
          .toBuffer();
        cachedKey = key;
      }

      const sinceCut = t - scene.start;
      const out =
        previousFinal && sceneIndex > 0 && sinceCut < DISSOLVE_S
          ? blend(previousFinal, cachedFrame!, easeInOutSine(sinceCut / DISSOLVE_S))
          : cachedFrame!;
      proc.stdin.write(out);
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

// Line-up reel: a hook, then one card per screening.
export const renderLineupReel = async (
  lineup: Screening[],
  hookLines: [string, string],
  moodSource: Screening
): Promise<Buffer> => {
  const posters = await Promise.all(lineup.map((s) => fetchReelPosterUrl(s, CARD_SIZE)));
  const specs: SceneSpec[] = [
    { minS: MIN_HOOK_S, make: (a, b) => hookScene(hookLines, posters[0] ?? null, a, b) },
    ...lineup.map((screening, i): SceneSpec => ({
      minS: MIN_CARD_S,
      make: (a, b) => cardScene(screening, i, lineup.length, posters[i] ?? null, a, b),
    })),
  ];
  return renderReel(specs, moodSource, posters.at(-1) ?? null);
};

// Anniversary reel: the round anniversary of a film's premiere over its
// poster, then the screening that brings it back to the big screen.
export const renderAnniversaryReel = async (
  screening: Screening,
  years: number,
  premiere: string // YYYY-MM-DD
): Promise<Buffer> => {
  const poster = await fetchReelPosterUrl(screening, CARD_SIZE);
  const specs: SceneSpec[] = [
    { minS: MIN_HOOK_S + 0.4, make: (a, b) => anniversaryHookScene(screening, years, premiere, poster, a, b) },
    { minS: MIN_CARD_S + 0.4, make: (a, b) => anniversaryCardScene(screening, poster, a, b) },
  ];
  return renderReel(specs, screening, poster);
};
