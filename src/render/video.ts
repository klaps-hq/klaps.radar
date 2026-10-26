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

type Overlay = "hookFirst" | "hookFull" | "title" | "when" | "where";
type Segment = {
  beats: number; // length in beats
  shot?: number; // index of the still
  overlay?: Overlay;
  punch?: boolean;
  drop?: boolean; // white flash + shake
  dim?: boolean;
  end?: boolean;
};

// The edit, in beats (16 in total, 7-10 s depending on tempo): a boxed
// hook on the key art, the drop, a different still on every fast cut with
// the title landing mid-run, date and venue over dimmed stills, and a
// short end card that loops back to the hook.
const EDIT: Segment[] = [
  { beats: 1, shot: 0, overlay: "hookFirst", punch: true },
  { beats: 1, shot: 0, overlay: "hookFull" },
  { beats: 1, shot: 1, punch: true, drop: true },
  { beats: 1, shot: 2, punch: true },
  { beats: 1, shot: 3, punch: true },
  { beats: 1, shot: 4, punch: true },
  { beats: 1, shot: 5, overlay: "title", punch: true },
  { beats: 1, shot: 6, overlay: "title", punch: true },
  { beats: 1, shot: 7, overlay: "title", punch: true },
  { beats: 1, shot: 1, overlay: "title", punch: true },
  { beats: 2, shot: 2, overlay: "when", punch: true, dim: true },
  { beats: 2, shot: 3, overlay: "where", punch: true, dim: true },
  { beats: 2, end: true },
];
const TOTAL_BEATS = EDIT.reduce((sum, s) => sum + s.beats, 0);

const run = async (args: string[]): Promise<void> => {
  const proc = Bun.spawn([FFMPEG, "-y", "-loglevel", "error", ...args], {
    stderr: "pipe",
  });
  if ((await proc.exited) !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`ffmpeg failed: ${stderr.trim().slice(0, 800)}`);
  }
};

// Longer than this and the edit drags; slow tracks (often detected at half
// tempo) are cut on half beats instead.
const MAX_EDIT_S = 11;

// Beat times from the track, extended with its period if the track's grid
// is shorter than the edit.
const beatTimes = (beats: number[], period: number, count: number): number[] => {
  const origin = beats[0] ?? 0;
  let times = beats.map((b) => b - origin);
  while (period * (count - 1) > MAX_EDIT_S) {
    times = times.flatMap((t) => [t, t + period / 2]);
    period /= 2;
  }
  while (times.length < count) times.push((times.at(-1) ?? -period) + period);
  return times.slice(0, count);
};

export const renderScreeningReel = async (
  screening: Screening
): Promise<Buffer> => {
  const genreIds = (screening.movie.movies_genres ?? []).map((g) => g.genreId);
  const mood = pickMood(genreIds, screening.movie.productionYear);
  const variant = (screening.movie.title.length % 2) as 0 | 1;
  const music = join(AUDIO_DIR, musicFile(mood, variant));

  const [assets, grid] = await Promise.all([
    renderReelAssets(screening),
    detectBeats(music),
  ]);
  const times = beatTimes(grid.beats, grid.period, TOTAL_BEATS + 1);
  const musicStart = grid.beats[0] ?? 0;

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
      ...Object.entries(assets.overlays).map(([name, b]) => write(`${name}.png`, b)),
      write("end.jpg", assets.end),
    ]);
    const stills = assets.shots.length;

    const inputs: string[] = [];
    let inputCount = 0;
    const addInput = (file: string, seconds: number): number => {
      inputs.push("-loop", "1", "-framerate", String(FPS), "-t", seconds.toFixed(3), "-i", file);
      return inputCount++;
    };

    const filters: string[] = [];
    let beat = 0;
    let dropAt = 0;
    let previousStill = -1;
    EDIT.forEach((segment, i) => {
      const startFrame = Math.round(times[beat]! * FPS);
      beat += segment.beats;
      const frames = Math.round(times[beat]! * FPS) - startFrame;
      const seconds = frames / FPS + 0.1;
      const exact = `trim=end_frame=${frames},setpts=PTS-STARTPTS`;

      if (segment.end) {
        const input = addInput(files.get("end.jpg")!, seconds);
        filters.push(`[${input}:v]scale=${W}:${H},setsar=1,fps=${FPS},${exact}[v${i}]`);
        return;
      }

      // With fewer stills than cuts, the shot index wraps; skip ahead when
      // that would repeat the previous cut's still (the hook's two beats
      // are one shot on purpose).
      let still = segment.shot! % stills;
      if (still === previousStill && segment.shot !== EDIT[i - 1]?.shot && stills > 1) {
        still = (still + 1) % stills;
      }
      previousStill = still;
      const input = addInput(files.get(`shot-${still}.jpg`)!, seconds);
      const zoom = segment.punch
        ? `if(lt(on,${PUNCH_FRAMES}),${PUNCH_FROM}-${((PUNCH_FROM - 1) / PUNCH_FRAMES).toFixed(4)}*on,1)`
        : "1";
      let chain =
        `[${input}:v]zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},setsar=1`;
      if (segment.dim) chain += ",eq=brightness=-0.12:saturation=0.85";
      if (segment.drop) {
        dropAt = startFrame / FPS;
        const jitter = `if(lt(t,${SHAKE_S}),${SHAKE_PX}*sin(t*160)*(1-t/${SHAKE_S}),0)`;
        chain +=
          `,fade=t=in:st=0:d=${FLASH_S}:color=white` +
          `,pad=${W + SHAKE_PX * 2}:${H + SHAKE_PX * 2}:${SHAKE_PX}:${SHAKE_PX}:black` +
          `,crop=${W}:${H}:x='${SHAKE_PX}+${jitter}':y='${SHAKE_PX}-${jitter}'`;
      }
      if (segment.overlay) {
        const overlay = addInput(files.get(`${segment.overlay}.png`)!, seconds);
        filters.push(`${chain}[b${i}]`);
        filters.push(`[b${i}][${overlay}:v]overlay=0:0,${exact}[v${i}]`);
      } else {
        filters.push(`${chain},${exact}[v${i}]`);
      }
    });
    filters.push(
      `${EDIT.map((_, i) => `[v${i}]`).join("")}concat=n=${EDIT.length}:v=1:a=0,format=yuv420p[v]`
    );

    const total = Math.round(times[TOTAL_BEATS]! * FPS) / FPS;
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
