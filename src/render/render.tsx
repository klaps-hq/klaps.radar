import satori from "satori";
import sharp from "sharp";
import { getMovieArt } from "../media/tmdb";
import type { Screening } from "../types/types";
import {
  CarouselCover,
  CarouselOutro,
  STRIP_SIZE,
  type CarouselEntry,
} from "./carousel";
import {
  getCardSize,
  LAYOUTS,
  ScreeningImage,
  type Variant,
} from "./template";

type SatoriFont = Parameters<typeof satori>[1]["fonts"][number];

let fontsPromise: Promise<SatoriFont[]> | undefined;

const loadFont = (file: string): Promise<ArrayBuffer> =>
  Bun.file(new URL(`../../assets/fonts/${file}`, import.meta.url)).arrayBuffer();

export const loadFonts = (): Promise<SatoriFont[]> => {
  fontsPromise ??= Promise.all([
    loadFont("Inter-Regular.ttf"),
    loadFont("Inter-Bold.ttf"),
    loadFont("Anton-Regular.ttf"),
  ]).then(([regular, bold, anton]) => [
    { name: "Inter", data: regular, weight: 400, style: "normal" },
    { name: "Inter", data: bold, weight: 700, style: "normal" },
    { name: "Anton", data: anton, weight: 400, style: "normal" },
  ]);

  return fontsPromise;
};

// The DB stores TMDB paths ("/abc.jpg"), not full URLs. Full "original"
// resolution: the story card is ~1700px tall, so sized variants (w1280)
// would be upscaled and soft.
const resolveImageUrl = (value: string, size = "original"): string =>
  value.startsWith("/") ? `https://image.tmdb.org/t/p/${size}${value}` : value;

const getScreeningImagePath = (screening: Screening): string | null =>
  screening.movie.backdropUrl ?? screening.movie.posterUrl;

const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  return response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
};

type Box = { width: number; height: number };

// Backdrops are 16:9 and every card is portrait, so most of the frame is
// cut away. A centred crop often keeps the empty middle of a two-shot (the
// faces sit at the edges), so the crop follows sharp's attention strategy
// instead: it favours skin tones, saturation and detail. Satori then gets
// an image that already has the card's aspect ratio. Satori does not fetch
// remote images, so the result is inlined as a data URL.
const cropToBox = async (image: Buffer, box: Box): Promise<string> => {
  const cropped = await sharp(image)
    .resize({
      width: box.width,
      height: box.height,
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
  return `data:image/jpeg;base64,${cropped.toString("base64")}`;
};

const renderElement = async (
  element: Parameters<typeof satori>[0],
  size: { width: number; height: number },
  format: "jpeg" | "png" = "jpeg"
): Promise<Buffer> => {
  const svg = await satori(element, {
    width: size.width,
    height: size.height,
    fonts: await loadFonts(),
  });

  const image = sharp(Buffer.from(svg));
  return format === "png"
    ? image.png().toBuffer()
    : image.jpeg({ quality: 92 }).toBuffer();
};

// Portrait cards prefer TMDB's textless key art, which is composed for a
// vertical frame; landscape slots (carousel strips) keep the backdrop.
// Some key art on TMDB is a cut-out: a figure on a transparent or flat
// white ground, or a tilted print with an empty band along an edge. Full
// frame, it reads as a pasted sticker, so such art is skipped for the next
// image. Dark corners alone are common in real artwork and do not count.
const CORNER = 0.06;
const EDGE_BAND = 0.12;

type Region = { left: number; top: number; width: number; height: number };

// Mean brightness and the largest channel spread of a region. stats()
// reads the input, not the pipeline, so the region is cut out first.
const regionStats = async (image: Buffer, region: Region) => {
  const part = await sharp(image).extract(region).removeAlpha().toBuffer();
  const { channels } = await sharp(part).stats();
  return {
    mean: channels.reduce((sum, c) => sum + c.mean, 0) / channels.length,
    spread: Math.max(...channels.map((c) => c.stdev)),
  };
};

const isCutout = async (image: Buffer): Promise<boolean> => {
  const meta = await sharp(image).metadata();
  if (meta.hasAlpha) {
    const { channels } = await sharp(image).stats();
    if ((channels[3]?.mean ?? 255) < 250) return true;
  }
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) return false;

  const size = Math.max(8, Math.round(Math.min(w, h) * CORNER));
  let white = 0;
  for (const [left, top] of [[0, 0], [w - size, 0], [0, h - size], [w - size, h - size]]) {
    const { mean, spread } = await regionStats(image, { left: left!, top: top!, width: size, height: size });
    if (mean > 243 && spread < 4) white += 1;
  }
  if (white >= 3) return true;

  const bw = Math.round(w * EDGE_BAND);
  const bh = Math.round(h * EDGE_BAND);
  const bands: Region[] = [
    { left: 0, top: 0, width: w, height: bh },
    { left: 0, top: h - bh, width: w, height: bh },
    { left: 0, top: 0, width: bw, height: h },
    { left: w - bw, top: 0, width: bw, height: h },
  ];
  for (const band of bands) {
    const { mean, spread } = await regionStats(image, band);
    if (mean < 14 && spread < 8) return true;
  }
  return false;
};

// The first usable image among textless key art and the given fallbacks
// (cut-outs skipped); if all are cut-outs, the first that loads.
const fetchKeyArt = async (
  screening: Screening,
  fallbacks: (string | null | undefined)[],
  size?: string
): Promise<Buffer | null> => {
  const art = await getMovieArt(screening.movie);
  const paths = [art.textlessPoster, ...fallbacks].filter(
    (p, i, all): p is string => Boolean(p) && all.indexOf(p) === i
  );
  let first: Buffer | null = null;
  for (const path of paths) {
    const image = await fetchImageBuffer(resolveImageUrl(path, size));
    if (!image) continue;
    if (!(await isCutout(image))) return image;
    first ??= image;
  }
  return first;
};

const fetchScreeningImage = async (
  screening: Screening,
  box: Box,
  size?: string
): Promise<string | null> => {
  const portrait = box.height > box.width;
  const fallback = getScreeningImagePath(screening);
  const image = portrait
    ? await fetchKeyArt(screening, [fallback, screening.movie.backdropUrl], size)
    : fallback
      ? await fetchImageBuffer(resolveImageUrl(fallback, size))
      : null;
  return image ? cropToBox(image, box) : null;
};

export const renderScreeningImage = async (
  variant: Variant,
  screening: Screening
): Promise<Buffer> => {
  const imageUrl = await fetchScreeningImage(screening, getCardSize(variant));

  return renderElement(
    <ScreeningImage screening={screening} imageUrl={imageUrl} variant={variant} />,
    LAYOUTS[variant]
  );
};

// Line-up reel shots are posters, never stills: posters are composed for
// a vertical frame and hold up full screen, while TMDB stills are often low
// resolution or landscape promo art. Textless key art first, then the
// poster from our DB, then a backdrop as the last resort.
const fetchReelPoster = (screening: Screening): Promise<Buffer | null> =>
  fetchKeyArt(screening, [screening.movie.posterUrl, screening.movie.backdropUrl]);

// A screening's reel poster cropped to the card (attention-centred) and
// inlined as a data URL; null when the movie has no image at all.
export const fetchReelPosterUrl = async (
  screening: Screening,
  box: Box
): Promise<string | null> => {
  const poster = await fetchReelPoster(screening);
  return poster ? cropToBox(poster, box) : null;
};

// Weekly carousel: cover with the line-up, one post-style slide per
// screening with a page counter, and a save/visit outro.
export const renderCarouselImages = async (
  screenings: Screening[],
  range: { dateFrom: string; dateTo: string }
): Promise<Buffer[]> => {
  const [stripImages, slideImages] = await Promise.all([
    Promise.all(
      screenings.map((s) => fetchScreeningImage(s, STRIP_SIZE, "w780"))
    ),
    Promise.all(
      screenings.map((s) => fetchScreeningImage(s, getCardSize("post")))
    ),
  ]);
  const entries: CarouselEntry[] = screenings.map((screening, i) => ({
    screening,
    imageUrl: stripImages[i] ?? null,
  }));
  const total = screenings.length + 2;

  return Promise.all([
    renderElement(<CarouselCover entries={entries} {...range} />, LAYOUTS.post),
    ...screenings.map((screening, i) =>
      renderElement(
        <ScreeningImage
          screening={screening}
          imageUrl={slideImages[i] ?? null}
          variant="post"
          footerLabel={`${i + 2} / ${total}`}
        />,
        LAYOUTS.post
      )
    ),
    renderElement(<CarouselOutro />, LAYOUTS.post),
  ]);
};
