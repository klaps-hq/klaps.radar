import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import overrides from "../../assets/art-overrides.json";
import { cropToBox, fetchImageBuffer, isCutout, resolveImageUrl } from "../render/render";
import type { Screening } from "../types/types";
import { getMovieArt } from "./tmdb";

// Picks the image a card shows for a movie and the point to crop around.
// 1. Candidates: every usable TMDB image of the requested kind.
// 2. Heuristic score from cheap measurements (sharpness, contrast, detail,
//    exposure, a calm bottom for the text, the subject above the text, few
//    empty areas, how much survives the crop), cut-outs rejected. When no
//    poster scores well enough, stills join the poster candidates.
// 3. Gemini looks at the best few and picks the most recognisable one plus
//    its focal point (usually a face). Optional: without GEMINI_API_KEY, or
//    on any failure, the heuristic winner is used with an attention crop.
// The decision is made once per movie and kind and cached in a JSON file;
// assets/art-overrides.json wins over everything (manual picks).
type Movie = Screening["movie"];

// "poster": posters only (reels, film slides); "still": backdrops only;
// "any": both, for single-film cards where a strong still may beat the art.
export type ArtKind = "poster" | "still" | "any";

export type Focus = { x: number; y: number };
export type ArtPick = {
  path: string;
  // Focal point in the image, 0..1 from the top-left; null = attention crop.
  focus: Focus | null;
  source: "manual" | "gemini" | "heuristic";
};

type Box = { width: number; height: number };

// assets/art-overrides.json: { "<title>|<year>": { "<kind>": { "path":
// "/abc.jpg", "focus": { "x": 0.5, "y": 0.3 } } } }. Path is a TMDB path.
type Overrides = Record<string, Partial<Record<ArtKind, { path: string; focus?: Focus | null }>>>;

const MAX_CANDIDATES = 10;
// How many of the heuristic's best go to Gemini.
const SHORTLIST = 5;
// The card shape the picks are judged for (post / story / reel are all
// portrait, between 4:5 and 9:16).
const TARGET_ASPECT = 4 / 5;
// A focal point lands this far down the crop, so faces sit in the upper
// part of the card and the text keeps the bottom.
const FOCUS_ROW = 0.38;

const CACHE_FILE =
  process.env.ART_CACHE_FILE ?? (existsSync("/data") ? "/data/art-picks.json" : ".cache/art-picks.json");

const movieKey = (movie: Movie) => `${movie.title}|${movie.productionYear}`;

let cachePromise: Promise<Record<string, ArtPick>> | undefined;
const loadCache = () => {
  cachePromise ??= Bun.file(CACHE_FILE)
    .json()
    .catch(() => ({}));
  return cachePromise;
};

const saveCache = async (cache: Record<string, ArtPick>) => {
  await mkdir(dirname(CACHE_FILE), { recursive: true }).catch(() => {});
  await Bun.write(CACHE_FILE, JSON.stringify(cache, null, 2)).catch(() => {});
};

const candidatePaths = async (movie: Movie, kind: ArtKind): Promise<string[]> => {
  const art = await getMovieArt(movie);
  const posters = [...art.textlessPosters, movie.posterUrl];
  const stills = [...art.backdrops, movie.backdropUrl];
  const paths = kind === "poster" ? posters : kind === "still" ? stills : [...posters, ...stills];
  return paths
    .filter((p, i, all): p is string => Boolean(p) && all.indexOf(p) === i)
    .slice(0, MAX_CANDIDATES);
};

type Candidate = { path: string; thumb: Buffer; score: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// The card's title, date and venue cover roughly the bottom third.
const TEXT_ZONE = 0.35;
// Below this the best poster is a poor fit (the subject sits under the
// text, or most of the frame is empty), so stills compete too.
const MIN_POSTER_SCORE = 0.65;

// Edge energy of a greyscale image on a grid. A light blur first, so film
// grain and print texture (an empty textured sky on textless key art) do
// not pass for detail.
const GRID_COLS = 8;
const GRID_ROWS = 10;
// Mean edge energy below which a grid cell counts as empty.
const EMPTY_CELL = 1.5;

const measureEdges = async (grey: Buffer) => {
  // Offset 128 keeps the negative half of the Laplacian; toBuffer() so the
  // numbers come from the filtered pixels (stats() would read the input).
  const { data, info } = await sharp(grey)
    .blur(1)
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const cells = new Array<number>(GRID_COLS * GRID_ROWS).fill(0);
  const counts = new Array<number>(GRID_COLS * GRID_ROWS).fill(0);
  const textTop = height * (1 - TEXT_ZONE);
  let total = 0;
  let above = 0;
  for (let y = 0; y < height; y++) {
    const row = Math.min(GRID_ROWS - 1, Math.floor((y / height) * GRID_ROWS));
    for (let x = 0; x < width; x++) {
      const energy = Math.abs(data[y * width + x]! - 128);
      const cell = row * GRID_COLS + Math.min(GRID_COLS - 1, Math.floor((x / width) * GRID_COLS));
      cells[cell]! += energy;
      counts[cell]! += 1;
      total += energy;
      if (y < textTop) above += energy;
    }
  }
  const empty = cells.filter((sum, i) => sum / counts[i]! < EMPTY_CELL).length / cells.length;
  return {
    mean: total / (width * height),
    // Share of the detail above the text zone: where the subject is.
    aboveText: total ? above / total : 0,
    empty,
  };
};

// Higher is better, roughly 0..1. Measured on a ~400 px thumbnail.
const scoreImage = async (thumb: Buffer): Promise<number> => {
  if (await isCutout(thumb)) return -1;
  const small = await sharp(thumb).resize({ width: 400 }).toBuffer();
  const { width = 400, height = 400 } = await sharp(small).metadata();
  const grey = await sharp(small).greyscale().toBuffer();

  const edges = await measureEdges(grey);
  const tones = await sharp(grey).stats();
  const luma = tones.channels[0]!;
  const bottomTop = Math.round(height * 0.7);
  const bottom = await sharp(
    await sharp(grey).extract({ left: 0, top: bottomTop, width, height: height - bottomTop }).toBuffer()
  ).stats();

  const sharpness = clamp01(edges.mean / 6);
  const contrast = clamp01(luma.stdev / 60);
  const detail = clamp01(tones.entropy / 7.5);
  const calmBottom = 1 - clamp01(bottom.channels[0]!.stdev / 70);
  // Most of the detail should sit above the text, not under it.
  const subjectHigh = clamp01(edges.aboveText / 0.6);
  const filled = 1 - clamp01(edges.empty / 0.6);
  const aspect = width / height;
  const kept = aspect > TARGET_ASPECT ? TARGET_ASPECT / aspect : aspect / TARGET_ASPECT;
  const exposure = luma.mean < 35 || luma.mean > 220 ? -0.3 : 0;

  return (
    0.2 * sharpness +
    0.1 * contrast +
    0.1 * detail +
    0.1 * calmBottom +
    0.2 * subjectHigh +
    0.15 * filled +
    0.15 * kept +
    exposure
  );
};

const loadCandidates = async (paths: string[]): Promise<Candidate[]> => {
  const loaded = await Promise.all(
    paths.map(async (path) => {
      // w780 exists for both posters and backdrops on TMDB.
      const thumb = await fetchImageBuffer(resolveImageUrl(path, "w780"));
      if (!thumb) return null;
      const score = await scoreImage(thumb).catch(() => -1);
      return { path, thumb, score };
    })
  );
  return loaded
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => b.score - a.score);
};

type GeminiAnswer = { index: number; focus?: Focus };

const askGemini = async (movie: Movie, shortlist: Candidate[]): Promise<GeminiAnswer | null> => {
  const key = process.env.GEMINI_API_KEY;
  const url = process.env.GEMINI_API_URL;
  if (!key || !url || shortlist.length === 0) return null;

  const title = [movie.title, movie.titleOriginal].filter((t, i, all) => t && all.indexOf(t) === i).join(" / ");
  const prompt = [
    `You are the photo editor of a cinema Instagram account. Film: ${title} (${movie.productionYear}).`,
    `Below are ${shortlist.length} candidate images, numbered from 0 in the order given.`,
    "Pick the one that is the most recognisable and inviting for this film: an iconic scene or",
    "character, strong composition, no collage, no behind-the-scenes shot.",
    "Never pick an image with any visible text: titles, taglines, credits or logos (our card adds its",
    "own title), even if it is otherwise the best one.",
    "It will be cropped to a portrait 4:5 card with the title over the bottom third.",
    "Also give the focal point of that image (the eyes of the main face, or the key subject),",
    'as fractions of its width and height from the top-left. Answer JSON only:',
    '{"index": <number>, "focus": {"x": <0..1>, "y": <0..1>}}',
  ].join(" ");

  const parts = [
    { text: prompt },
    ...(await Promise.all(
      shortlist.map(async (c) => ({
        inline_data: {
          mime_type: "image/jpeg",
          data: (await sharp(c.thumb).resize({ width: 512 }).jpeg({ quality: 80 }).toBuffer()).toString("base64"),
        },
      }))
    )),
  ];

  // The key goes in a header, not the URL, so it stays out of request logs.
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
    signal: AbortSignal.timeout(60000),
  }).catch(() => null);
  if (!response?.ok) return null;

  const body = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    const answer = JSON.parse(text) as GeminiAnswer;
    if (!Number.isInteger(answer.index) || answer.index < 0 || answer.index >= shortlist.length) return null;
    const focus =
      answer.focus && Number.isFinite(answer.focus.x) && Number.isFinite(answer.focus.y)
        ? { x: clamp01(answer.focus.x), y: clamp01(answer.focus.y) }
        : undefined;
    return { index: answer.index, focus };
  } catch {
    return null;
  }
};

const decide = async (movie: Movie, kind: ArtKind): Promise<ArtPick | null> => {
  const manual = (overrides as Overrides)[movieKey(movie)]?.[kind];
  if (manual) return { path: manual.path, focus: manual.focus ?? null, source: "manual" };

  const cacheKey = `${movieKey(movie)}|${kind}`;
  const cache = await loadCache();
  if (cache[cacheKey]) return cache[cacheKey];

  let candidates = await loadCandidates(await candidatePaths(movie, kind));
  if (kind === "poster" && (candidates[0]?.score ?? -1) < MIN_POSTER_SCORE) {
    const stills = await loadCandidates(await candidatePaths(movie, "still"));
    candidates = [...candidates, ...stills].sort((a, b) => b.score - a.score);
  }
  const usable = candidates.filter((c) => c.score >= 0);
  const pool = usable.length ? usable : candidates;
  if (!pool.length) return null;

  const shortlist = pool.slice(0, SHORTLIST);
  const answer = await askGemini(movie, shortlist);
  const pick: ArtPick = answer
    ? { path: shortlist[answer.index]!.path, focus: answer.focus ?? null, source: "gemini" }
    : { path: pool[0]!.path, focus: null, source: "heuristic" };

  // Heuristic picks are not cached, so a later run with Gemini can improve them.
  if (pick.source === "gemini") {
    cache[cacheKey] = pick;
    await saveCache(cache);
  }
  return pick;
};

const pending = new Map<string, Promise<ArtPick | null>>();

export const pickArt = (movie: Movie, kind: ArtKind): Promise<ArtPick | null> => {
  const key = `${movieKey(movie)}|${kind}`;
  if (!pending.has(key)) pending.set(key, decide(movie, kind));
  return pending.get(key)!;
};

// Crops the image to the box with the focal point in the upper part of the
// frame, or falls back to the attention crop when there is no focal point.
export const cropAround = async (image: Buffer, box: Box, focus: Focus | null): Promise<string> => {
  if (!focus) return cropToBox(image, box);
  const { width: w = 0, height: h = 0 } = await sharp(image).metadata();
  if (!w || !h) return cropToBox(image, box);

  const aspect = box.width / box.height;
  const cropWidth = Math.min(w, Math.round(h * aspect));
  const cropHeight = Math.min(h, Math.round(cropWidth / aspect));
  const left = Math.round(Math.min(Math.max(focus.x * w - cropWidth / 2, 0), w - cropWidth));
  const top = Math.round(Math.min(Math.max(focus.y * h - cropHeight * FOCUS_ROW, 0), h - cropHeight));

  const cropped = await sharp(image)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize({ width: box.width, height: box.height, fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer();
  return `data:image/jpeg;base64,${cropped.toString("base64")}`;
};

// The picked image of a movie cropped to the box, as a data URL; null when
// the movie has no usable image at all.
export const fetchPickedArt = async (
  movie: Movie,
  kind: ArtKind,
  box: Box,
  size = "original"
): Promise<string | null> => {
  const pick = await pickArt(movie, kind);
  if (!pick) return null;
  const image = await fetchImageBuffer(resolveImageUrl(pick.path, size));
  return image ? cropAround(image, box, pick.focus) : null;
};
