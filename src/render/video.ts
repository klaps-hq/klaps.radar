import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { musicFile, pickMood, sfxFile, type Sfx } from "../audio/library";
import type { Screening } from "../types/types";
import { cropImage, fetchReelImages, renderReelCards } from "./render";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const AUDIO_DIR = fileURLToPath(new URL("../../assets/audio/", import.meta.url));
const FPS = 30;
const W = 1080;
const H = 1920;
// Motion is computed at twice the output size and scaled down, so pans and
// zooms move in half-pixel steps and stay smooth.
const SS = 2;
// Pan shots are cropped this much wider than the frame around their focus,
// which is the distance the camera travels.
const PAN_WIDTH = 1.3;
const ZOOM = 0.1;
// Scene overlays slide up this far while fading in.
const SLIDE_PX = 80;
const REVEAL_S = 0.45;

// Montage, 12 s: intro card, three scenes (each with its own message) and
// an end card, cut on whooshes over a genre-matched music bed.
const SEGMENTS = {
  intro: 0.9,
  title: 3.5,
  date: 3.2,
  place: 2.8,
  end: 1.6,
};
// Scene overlays appear this long after their cut.
const REVEAL_AT = { title: 0.3, date: 0.2, place: 0.2 };

const at = (segment: keyof typeof SEGMENTS): number => {
  let t = 0;
  for (const [name, length] of Object.entries(SEGMENTS)) {
    if (name === segment) return t;
    t += length;
  }
  return t;
};
const TOTAL_S = Object.values(SEGMENTS).reduce((a, b) => a + b, 0);

// [sound, start time in s, gain]
const SOUND_CUES: [Sfx, number, number][] = [
  ["projector", 0, 0.7],
  ["whoosh1", at("title") - 0.15, 0.8],
  ["impact", at("title") + REVEAL_AT.title - 0.05, 0.9],
  ["whoosh2", at("date") - 0.15, 0.7],
  ["whoosh1", at("place") - 0.15, 0.7],
  ["click", at("end") - 0.05, 0.8],
];
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

const still = (path: string, seconds: number): string[] => [
  "-loop", "1", "-framerate", String(FPS), "-t", seconds.toFixed(2), "-i", path,
];

// Slide-up + fade-in of a scene overlay starting `start` s into its shot.
const reveal = (shot: string, overlay: string, start: number, out: string) =>
  `[${overlay}]format=rgba,fade=t=in:st=${start}:d=${REVEAL_S}:alpha=1[${overlay}f];` +
  `[${shot}][${overlay}f]overlay=x=0:y='if(lt(t,${start}),${SLIDE_PX},if(lt(t,${start + REVEAL_S}),${SLIDE_PX}*(1-(t-${start})/${REVEAL_S}),0))'[${out}]`;

// Film grain and a soft vignette, so stills read as footage.
const FILM_LOOK = "noise=alls=7:allf=t+u,vignette=PI/5";

export const renderScreeningReel = async (
  screening: Screening
): Promise<Buffer> => {
  const images = await fetchReelImages(screening);
  if (images.length === 0) {
    throw new Error("Reel needs at least one poster or backdrop image");
  }
  // Fewer than three stills: reuse them, the shots still move differently.
  const pick = (i: number) => images[i % images.length]!;

  const dir = await mkdtemp(join(tmpdir(), "klaps-reel-"));
  try {
    const cards = await renderReelCards(screening);
    const files = {
      intro: join(dir, "intro.jpg"),
      shot1: join(dir, "shot1.jpg"),
      shot2: join(dir, "shot2.jpg"),
      shot3: join(dir, "shot3.jpg"),
      end: join(dir, "end.jpg"),
      title: join(dir, "title.png"),
      date: join(dir, "date.png"),
      place: join(dir, "place.png"),
      output: join(dir, "reel.mp4"),
    };
    const zoomBox = { width: W * SS, height: H * SS };
    const panBox = { width: Math.round(W * SS * PAN_WIDTH), height: H * SS };
    await Promise.all([
      Bun.write(files.intro, cards.intro),
      Bun.write(files.end, cards.end),
      Bun.write(files.title, cards.title),
      Bun.write(files.date, cards.date),
      Bun.write(files.place, cards.place),
      cropImage(pick(0), zoomBox).then((b) => Bun.write(files.shot1, b)),
      cropImage(pick(1), panBox).then((b) => Bun.write(files.shot2, b)),
      cropImage(pick(2), panBox).then((b) => Bun.write(files.shot3, b)),
    ]);

    const genreIds = (screening.movie.movies_genres ?? []).map((g) => g.genreId);
    const mood = pickMood(genreIds, screening.movie.productionYear);
    const variant = (screening.movie.title.length % 2) as 0 | 1;
    const music = join(AUDIO_DIR, musicFile(mood, variant));

    const inputs = [
      ...still(files.intro, SEGMENTS.intro), // 0
      ...still(files.shot1, SEGMENTS.title), // 1
      ...still(files.shot2, SEGMENTS.date), // 2
      ...still(files.shot3, SEGMENTS.place), // 3
      ...still(files.end, SEGMENTS.end), // 4
      ...still(files.title, SEGMENTS.title), // 5
      ...still(files.date, SEGMENTS.date), // 6
      ...still(files.place, SEGMENTS.place), // 7
      "-i", music, // 8
      ...SOUND_CUES.flatMap(([sfx]) => ["-i", join(AUDIO_DIR, sfxFile(sfx))]), // 9..
    ];

    const zoomFrames = Math.round(SEGMENTS.title * FPS);
    const panW = W * SS;
    const video = [
      `[0:v]scale=${W}:${H},setsar=1,fps=${FPS},format=yuv420p[v0]`,
      // Push-in on the first shot (key art or best still).
      `[1:v]zoompan=z='1+${ZOOM}*on/${zoomFrames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},${FILM_LOOK},setsar=1[s1]`,
      // Pans in opposite directions so consecutive shots do not feel repeated.
      `[2:v]crop=${panW}:${H * SS}:x='(iw-${panW})*t/${SEGMENTS.date}':y=0,scale=${W}:${H}:flags=lanczos,${FILM_LOOK},setsar=1[s2]`,
      `[3:v]crop=${panW}:${H * SS}:x='(iw-${panW})*(1-t/${SEGMENTS.place})':y=0,scale=${W}:${H}:flags=lanczos,${FILM_LOOK},setsar=1[s3]`,
      `[5:v]copy[o1]`,
      `[6:v]copy[o2]`,
      `[7:v]copy[o3]`,
      reveal("s1", "o1", REVEAL_AT.title, "v1"),
      reveal("s2", "o2", REVEAL_AT.date, "v2"),
      reveal("s3", "o3", REVEAL_AT.place, "v3"),
      `[4:v]scale=${W}:${H},setsar=1,fps=${FPS},fade=t=in:st=0:d=0.25[v4]`,
      `[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0,format=yuv420p[v]`,
    ];

    const cueLabels = SOUND_CUES.map((_, i) => `c${i}`);
    const audio = [
      `[8:a]atrim=0:${TOTAL_S},afade=t=in:st=0:d=0.4,afade=t=out:st=${TOTAL_S - 1.2}:d=1.2,volume=${MUSIC_GAIN}[m]`,
      ...SOUND_CUES.map(([, start, gain], i) => {
        const ms = Math.max(0, Math.round(start * 1000));
        return `[${9 + i}:a]adelay=${ms}|${ms},volume=${gain}[${cueLabels[i]}]`;
      }),
      `[m]${cueLabels.map((l) => `[${l}]`).join("")}amix=inputs=${SOUND_CUES.length + 1}:normalize=0:duration=first,alimiter=limit=0.9,aresample=44100[a]`,
    ];

    await run([
      ...inputs,
      "-filter_complex", [...video, ...audio].join(";"),
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "21",
      // Grain is expensive to encode; cap the rate to stay well under the
      // 15 MB upload limit of the image host.
      "-maxrate", "5M", "-bufsize", "10M", "-r", String(FPS),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-ac", "2",
      "-t", TOTAL_S.toFixed(2),
      "-movflags", "+faststart",
      files.output,
    ]);

    return Buffer.from(await Bun.file(files.output).arrayBuffer());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
