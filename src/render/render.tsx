import satori from "satori";
import sharp from "sharp";
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

const fetchScreeningImage = async (
  screening: Screening,
  box: Box,
  size?: string
): Promise<string | null> => {
  const path = getScreeningImagePath(screening);
  const image = path ? await fetchImageBuffer(resolveImageUrl(path, size)) : null;
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
  return path ? fetchImageBuffer(resolveImageUrl(path)) : null;
};

// Horizontal focus of an image once scaled to cover `box`, as a share of
// the overflow (0 = left edge, 1 = right edge), from the same attention
// strategy as the stills. The reel pans around this point.
export const findHorizontalFocus = async (
  image: Buffer,
  box: Box
): Promise<number> => {
  const { info } = await sharp(image)
    .resize({
      width: box.width,
      height: box.height,
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .toBuffer({ resolveWithObject: true });
  const meta = await sharp(image).metadata();
  const scaledWidth = Math.round(
    ((meta.width ?? box.width) * box.height) / (meta.height ?? box.height)
  );
  const overflow = scaledWidth - box.width;
  if (overflow <= 0) return 0.5;
  return Math.min(1, Math.max(0, Math.abs(info.cropOffsetLeft ?? 0) / overflow));
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
