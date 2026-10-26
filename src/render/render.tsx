import satori from "satori";
import sharp from "sharp";
import type { Screening } from "../types/types";
import { CarouselCover, CarouselOutro, type CarouselEntry } from "./carousel";
import { LAYOUTS, ScreeningImage, type Variant } from "./template";

type SatoriFont = Parameters<typeof satori>[1]["fonts"][number];

let fontsPromise: Promise<SatoriFont[]> | undefined;

const loadFont = (file: string): Promise<ArrayBuffer> =>
  Bun.file(new URL(`../../assets/fonts/${file}`, import.meta.url)).arrayBuffer();

const loadFonts = (): Promise<SatoriFont[]> => {
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

// Satori does not fetch remote images and sharp will not resolve network
// hrefs in the SVG, so every image is inlined as a data URL.
const fetchImageAsDataUrl = async (
  url: string
): Promise<string | null> => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
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

const fetchScreeningImage = async (
  screening: Screening,
  size?: string
): Promise<string | null> => {
  const path = getScreeningImagePath(screening);
  return path ? fetchImageAsDataUrl(resolveImageUrl(path, size)) : null;
};

export const renderScreeningImage = async (
  variant: Variant,
  screening: Screening
): Promise<Buffer> => {
  const imageUrl = await fetchScreeningImage(screening);

  return renderElement(
    <ScreeningImage screening={screening} imageUrl={imageUrl} variant={variant} />,
    LAYOUTS[variant]
  );
};

// Transparent PNG with the scrims and text, laid over the animated backdrop
// by the reel video pipeline.
export const renderReelOverlay = (screening: Screening): Promise<Buffer> =>
  renderElement(
    <ScreeningImage screening={screening} imageUrl={null} variant="reel" />,
    LAYOUTS.reel,
    "png"
  );

// Raw backdrop (or poster) bytes for the video pipeline, which crops and
// animates the image itself.
export const fetchScreeningImageBuffer = async (
  screening: Screening
): Promise<Buffer | null> => {
  const path = getScreeningImagePath(screening);
  if (!path) return null;

  const response = await fetch(resolveImageUrl(path), {
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  return response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
};

// Weekly carousel: cover with the line-up, one post-style slide per
// screening with a page counter, and a save/visit outro.
export const renderCarouselImages = async (
  screenings: Screening[],
  range: { dateFrom: string; dateTo: string }
): Promise<Buffer[]> => {
  const [stripImages, slideImages] = await Promise.all([
    Promise.all(screenings.map((s) => fetchScreeningImage(s, "w780"))),
    Promise.all(screenings.map((s) => fetchScreeningImage(s))),
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
