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
  INFO_STEPS,
  ReelEndCard,
  ReelInfo,
  ReelScreen,
  ReelSlate,
  REEL_SIZE,
  SCREEN_SIZE,
} from "./reel";
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

// Portrait cards prefer TMDB's textless key art, which is composed for a
// vertical frame; landscape slots (carousel strips) keep the backdrop.
const fetchScreeningImage = async (
  screening: Screening,
  box: Box,
  size?: string
): Promise<string | null> => {
  const portrait = box.height > box.width;
  const art = portrait ? await getMovieArt(screening.movie) : null;
  const path = art?.textlessPoster ?? getScreeningImagePath(screening);
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

// Stills for the reel's cinema screen: backdrops first (already 16:9),
// key art only as a last resort. Raw bytes.
const fetchReelStills = async (screening: Screening): Promise<Buffer[]> => {
  const art = await getMovieArt(screening.movie);
  const paths = art.backdrops.length
    ? art.backdrops
    : [art.textlessPoster ?? screening.movie.posterUrl].filter(
        (p): p is string => Boolean(p)
      );
  const images = await Promise.all(
    paths.map((p) => fetchImageBuffer(resolveImageUrl(p)))
  );
  return images.filter((i): i is Buffer => i !== null);
};

export const REEL_SCREEN_CUTS = 4;

// Every frame of the reel as a JPEG, in order: slate open and shut, the
// screen cuts, the info lines landing, and the end card.
export const renderReelFrames = async (screening: Screening) => {
  const stills = await fetchReelStills(screening);
  if (stills.length === 0) {
    throw new Error("Reel needs at least one backdrop or poster image");
  }
  const screenImages = await Promise.all(
    Array.from({ length: REEL_SCREEN_CUTS }, (_, i) =>
      cropToBox(stills[i % stills.length]!, SCREEN_SIZE)
    )
  );

  const [slateOpen, slateShut, end, ...rest] = await Promise.all([
    renderElement(<ReelSlate screening={screening} open />, REEL_SIZE),
    renderElement(<ReelSlate screening={screening} open={false} />, REEL_SIZE),
    renderElement(<ReelEndCard screening={screening} />, REEL_SIZE),
    ...screenImages.map((imageUrl, index) =>
      renderElement(
        <ReelScreen
          screening={screening}
          imageUrl={imageUrl}
          index={index}
          total={REEL_SCREEN_CUTS}
        />,
        REEL_SIZE
      )
    ),
    ...Array.from({ length: INFO_STEPS }, (_, step) =>
      renderElement(<ReelInfo screening={screening} step={step} />, REEL_SIZE)
    ),
  ]);

  return {
    slateOpen: slateOpen!,
    slateShut: slateShut!,
    screens: rest.slice(0, REEL_SCREEN_CUTS),
    info: rest.slice(REEL_SCREEN_CUTS),
    end: end!,
  };
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
