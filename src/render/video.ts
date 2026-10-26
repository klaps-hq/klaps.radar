import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectBeats } from "../audio/beats";
import { musicFile, pickMood, sfxFile } from "../audio/library";
import type { Screening } from "../types/types";
import { renderReelAssets } from "./render";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const AUDIO_DIR = fileURLToPath(new URL("../../assets/audio/", import.meta.url));
const FPS = 30;
const W = 1080;
const H = 1920;
// Punch-in: each cut opens slightly zoomed and snaps to full frame within
// a few frames, the standard "impact" cut of short-form edits.
const PUNCH_FROM = 1.06;
const PUNCH_FRAMES = 5;
const SHAKE_PX = 18;
const SHAKE_S = 0.2;
const FLASH_S = 0.15;
const MUSIC_GAIN = 0.9;
// Each screening card stays up at least this long so title and date can
// be read; the hook a little longer for its two caption steps.
const MIN_CARD_S = 1.4;
const MIN_HOOK_S = 1.6;
// Longer than this and the edit drags; slow tracks (often detected at half
// tempo) are cut on half beats instead.
const MAX_EDIT_S = 14;

type Segment = {
  beats: number;
  shot?: number; // index into the poster shots
  overlay?: string; // overlay file name
  punch?: boolean;
  drop?: boolean; // white flash + shake
  end?: boolean;
};

// The edit, in beats: the boxed hook in two steps over the first poster,
// then one card per screening (the first lands on the drop), then a short
// end card that loops back to the hook.
const buildEdit = (count: number, period: number): Segment[] => {
  const hookBeats = Math.max(2, Math.ceil(MIN_HOOK_S / period));
  const cardBeats = Math.max(2, Math.ceil(MIN_CARD_S / period));
  const firstHook = Math.ceil(hookBeats / 2);
  return [
    { beats: firstHook, shot: 0, overlay: "hook-first.png", punch: true },
    { beats: hookBeats - firstHook, shot: 0, overlay: "hook-full.png" },
    ...Array.from({ length: count }, (_, i): Segment => ({
      beats: cardBeats,
      shot: i,
      overlay: `item-${i}.png`,
      punch: true,
      drop: i === 0,
    })),
    { beats: 2, end: true },
  ];
};

const run = async (args: string[]): Promise<void> => {
  const proc = Bun.spawn([FFMPEG, "-y", "-loglevel", "error", ...args], {
    stderr: "pipe",
  });
  if ((await proc.exited) !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`ffmpeg failed: ${stderr.trim().slice(0, 800)}`);
  }
};

// Beat times relative to the first beat, halved for slow tracks and
// extended with the period past the end of the detected grid.
const beatGrid = (beats: number[], period: number) => {
  let times = beats.map((b) => b - (beats[0] ?? 0));
  return {
    times,
    period,
    halve() {
      times = times.flatMap((t) => [t, t + period / 2]);
      period /= 2;
      this.times = times;
      this.period = period;
    },
    at(index: number): number {
      return times[index] ?? (times.at(-1) ?? 0) + (index - times.length + 1) * period;
    },
  };
};

// Line-up reel: the screenings in `lineup` as poster cards cut on the beat
// of a music bed matched to `moodSource` (the top-scored screening).
export const renderLineupReel = async (
  lineup: Screening[],
  hookLines: [string, string],
  moodSource: Screening
): Promise<Buffer> => {
  const genreIds = (moodSource.movie.movies_genres ?? []).map((g) => g.genreId);
  const mood = pickMood(genreIds, moodSource.movie.productionYear);
  const variant = (moodSource.movie.title.length % 2) as 0 | 1;
  const music = join(AUDIO_DIR, musicFile(mood, variant));

  const [assets, detected] = await Promise.all([
    renderReelAssets(lineup, hookLines),
    detectBeats(music),
  ]);
  const grid = beatGrid(detected.beats, detected.period);
  let edit = buildEdit(lineup.length, grid.period);
  const beatsOf = (e: Segment[]) => e.reduce((sum, s) => sum + s.beats, 0);
  while (grid.at(beatsOf(edit)) > MAX_EDIT_S && grid.period > 0.25) {
    grid.halve();
    edit = buildEdit(lineup.length, grid.period);
  }
  const musicStart = detected.beats[0] ?? 0;

  const dir = await mkdtemp(join(tmpdir(), "klaps-reel-"));
  try {
    const files = new Map<string, string>();
    const write = async (name: string, data: Buffer) => {
      const file = join(dir, name);
      await Bun.write(file, data);
      files.set(name, file);
    };
    await Promise.all([
      ...assets.shots.map((b, i) => write(`shot-${i}.jpg`, b)),
      ...assets.items.map((b, i) => write(`item-${i}.png`, b)),
      write("hook-first.png", assets.hookFirst),
      write("hook-full.png", assets.hookFull),
      write("end.jpg", assets.end),
    ]);

    const inputs: string[] = [];
    let inputCount = 0;
    const addInput = (file: string, seconds: number): number => {
      inputs.push("-loop", "1", "-framerate", String(FPS), "-t", seconds.toFixed(3), "-i", file);
      return inputCount++;
    };

    const filters: string[] = [];
    let beat = 0;
    let dropAt = 0;
    edit.forEach((segment, i) => {
      const startFrame = Math.round(grid.at(beat) * FPS);
      beat += segment.beats;
      const frames = Math.round(grid.at(beat) * FPS) - startFrame;
      const seconds = frames / FPS + 0.1;
      const exact = `trim=end_frame=${frames},setpts=PTS-STARTPTS`;

      if (segment.end) {
        const input = addInput(files.get("end.jpg")!, seconds);
        filters.push(`[${input}:v]scale=${W}:${H},setsar=1,fps=${FPS},${exact}[v${i}]`);
        return;
      }

      const input = addInput(files.get(`shot-${segment.shot}.jpg`)!, seconds);
      const zoom = segment.punch
        ? `if(lt(on,${PUNCH_FRAMES}),${PUNCH_FROM}-${((PUNCH_FROM - 1) / PUNCH_FRAMES).toFixed(4)}*on,1)`
        : "1";
      let chain =
        `[${input}:v]zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},setsar=1`;
      if (segment.drop) {
        dropAt = startFrame / FPS;
        const jitter = `if(lt(t,${SHAKE_S}),${SHAKE_PX}*sin(t*160)*(1-t/${SHAKE_S}),0)`;
        chain +=
          `,fade=t=in:st=0:d=${FLASH_S}:color=white` +
          `,pad=${W + SHAKE_PX * 2}:${H + SHAKE_PX * 2}:${SHAKE_PX}:${SHAKE_PX}:black` +
          `,crop=${W}:${H}:x='${SHAKE_PX}+${jitter}':y='${SHAKE_PX}-${jitter}'`;
      }
      const overlay = addInput(files.get(segment.overlay!)!, seconds);
      filters.push(`${chain}[b${i}]`);
      filters.push(`[b${i}][${overlay}:v]overlay=0:0,${exact}[v${i}]`);
    });
    filters.push(
      `${edit.map((_, i) => `[v${i}]`).join("")}concat=n=${edit.length}:v=1:a=0,format=yuv420p[v]`
    );

    const total = Math.round(grid.at(beat) * FPS) / FPS;
    const musicInput = inputCount++;
    const impactInput = inputCount++;
    inputs.push("-ss", musicStart.toFixed(3), "-i", music);
    inputs.push("-i", join(AUDIO_DIR, sfxFile("impact")));
    const dropMs = Math.round(dropAt * 1000);
    filters.push(
      `[${musicInput}:a]atrim=0:${total.toFixed(3)},afade=t=out:st=${(total - 0.35).toFixed(3)}:d=0.35,volume=${MUSIC_GAIN}[m]`,
      `[${impactInput}:a]adelay=${dropMs}|${dropMs},volume=0.55[hit]`,
      `[m][hit]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95,aresample=44100[a]`
    );

    const output = join(dir, "reel.mp4");
    await run([
      ...inputs,
      "-filter_complex", filters.join(";"),
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-maxrate", "6M", "-bufsize", "12M",
      "-r", String(FPS), "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-ac", "2",
      "-t", total.toFixed(3),
      "-movflags", "+faststart",
      output,
    ]);

    return Buffer.from(await Bun.file(output).arrayBuffer());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
