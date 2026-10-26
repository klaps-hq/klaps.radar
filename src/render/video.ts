import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { musicFile, pickMood, sfxFile, type Sfx } from "../audio/library";
import type { Screening } from "../types/types";
import { renderReelFrames } from "./render";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const AUDIO_DIR = fileURLToPath(new URL("../../assets/audio/", import.meta.url));
const FPS = 30;
const W = 1080;
const H = 1920;
// The music beds are prompted at ~100 bpm; cuts land on whole beats.
const BEAT_S = 0.6;
// The slate shudders this many pixels for a few frames when it claps shut.
const SHAKE_PX = 14;
const SHAKE_S = 0.14;

// "Klaps" reel, 12 s: slate open (2 beats), slate clapped shut (2 beats),
// four screen cuts (2 beats each), info lines landing on single beats with
// the last one held, end card. Hard cuts only: the stills never move.
type Shot = { file: string; seconds: number; shake?: boolean };

const MUSIC_GAIN = 0.55;

const run = async (args: string[]): Promise<void> => {
  const proc = Bun.spawn([FFMPEG, "-y", "-loglevel", "error", ...args], {
    stderr: "pipe",
  });
  if ((await proc.exited) !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`ffmpeg failed: ${stderr.trim().slice(0, 800)}`);
  }
};

export const renderScreeningReel = async (
  screening: Screening
): Promise<Buffer> => {
  const frames = await renderReelFrames(screening);
  const dir = await mkdtemp(join(tmpdir(), "klaps-reel-"));

  try {
    const write = async (name: string, data: Buffer) => {
      const file = join(dir, name);
      await Bun.write(file, data);
      return file;
    };

    const shots: Shot[] = [
      { file: await write("slate-open.jpg", frames.slateOpen), seconds: BEAT_S * 2 },
      { file: await write("slate-shut.jpg", frames.slateShut), seconds: BEAT_S * 2, shake: true },
      ...(await Promise.all(
        frames.screens.map(async (data, i) => ({
          file: await write(`screen-${i}.jpg`, data),
          seconds: BEAT_S * 2,
        }))
      )),
      ...(await Promise.all(
        frames.info.map(async (data, i) => ({
          file: await write(`info-${i}.jpg`, data),
          // The last line holds so the venue can be read.
          seconds: i === frames.info.length - 1 ? BEAT_S * 3 + 0.2 : BEAT_S,
        }))
      )),
      { file: await write("end.jpg", frames.end), seconds: BEAT_S * 2 + 0.4 },
    ];

    const starts: number[] = [];
    let total = 0;
    for (const shot of shots) {
      starts.push(total);
      total += shot.seconds;
    }
    const firstScreen = 2;
    const firstInfo = firstScreen + frames.screens.length;
    const endIndex = shots.length - 1;

    // [sound, start in s, gain]
    const cues: [Sfx, number, number][] = [
      ["projector", 0, 0.5],
      ["clap", starts[1]!, 1.0],
      ["impact", starts[firstScreen]!, 0.7],
      ...frames.screens
        .slice(1)
        .map((_, i): [Sfx, number, number] => ["tick", starts[firstScreen + 1 + i]!, 0.6]),
      ...frames.info.map((_, i): [Sfx, number, number] => ["tick", starts[firstInfo + i]!, 0.8]),
      ["click", starts[endIndex]!, 0.7],
    ];

    const genreIds = (screening.movie.movies_genres ?? []).map((g) => g.genreId);
    const mood = pickMood(genreIds, screening.movie.productionYear);
    const variant = (screening.movie.title.length % 2) as 0 | 1;

    const inputs = [
      ...shots.flatMap((s) => [
        "-loop", "1", "-framerate", String(FPS), "-t", s.seconds.toFixed(2), "-i", s.file,
      ]),
      "-i", join(AUDIO_DIR, musicFile(mood, variant)),
      ...cues.flatMap(([sfx]) => ["-i", join(AUDIO_DIR, sfxFile(sfx))]),
    ];
    const musicInput = shots.length;

    const video = [
      ...shots.map((s, i) => {
        const base = `[${i}:v]scale=${W}:${H},setsar=1,fps=${FPS}`;
        if (!s.shake) return `${base}[v${i}]`;
        // Pad, then crop with a decaying jitter for the first frames.
        const jitter = `if(lt(t,${SHAKE_S}),${SHAKE_PX}*sin(t*170)*(1-t/${SHAKE_S}),0)`;
        return (
          `${base},pad=${W + SHAKE_PX * 2}:${H + SHAKE_PX * 2}:${SHAKE_PX}:${SHAKE_PX}:black,` +
          `crop=${W}:${H}:x='${SHAKE_PX}+${jitter}':y='${SHAKE_PX}-${jitter}'[v${i}]`
        );
      }),
      `${shots.map((_, i) => `[v${i}]`).join("")}concat=n=${shots.length}:v=1:a=0,` +
        // Light grain so the flat black reads as film, not a slide deck.
        `noise=alls=6:allf=t+u,format=yuv420p[v]`,
    ];

    const audio = [
      `[${musicInput}:a]atrim=0:${total},afade=t=in:st=0:d=0.3,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2,volume=${MUSIC_GAIN}[m]`,
      ...cues.map(([, start, gain], i) => {
        const ms = Math.round(start * 1000);
        return `[${musicInput + 1 + i}:a]adelay=${ms}|${ms},volume=${gain}[c${i}]`;
      }),
      `[m]${cues.map((_, i) => `[c${i}]`).join("")}amix=inputs=${cues.length + 1}:normalize=0:duration=first,alimiter=limit=0.9,aresample=44100[a]`,
    ];

    const output = join(dir, "reel.mp4");
    await run([
      ...inputs,
      "-filter_complex", [...video, ...audio].join(";"),
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "21",
      // Grain is expensive to encode; cap the rate to stay well under the
      // 15 MB upload limit of the image host.
      "-maxrate", "5M", "-bufsize", "10M",
      "-r", String(FPS), "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-ac", "2",
      "-t", total.toFixed(2),
      "-movflags", "+faststart",
      output,
    ]);

    return Buffer.from(await Bun.file(output).arrayBuffer());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
