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
import { ReelCaption, ReelEnd, ReelLineupItem, REEL_SIZE } from "./reel";
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

// Line-up reel shots are posters, never stills: posters are composed for
// a vertical frame and hold up full screen, while TMDB stills are often low
// resolution or landscape promo art. Textless key art first, then the
// poster from our DB, then a backdrop as the last resort.
const fetchReelPoster = async (screening: Screening): Promise<Buffer | null> => {
  const art = await getMovieArt(screening.movie);
  const path =
    art.textlessPoster ?? screening.movie.posterUrl ?? screening.movie.backdropUrl;
  return path ? fetchImageBuffer(resolveImageUrl(path)) : null;
};

// Shots are rendered at twice the output size so the punch-in zoom stays
// sharp.
const SHOT_SCALE = 2;
export const REEL_SHOT_SCALE = SHOT_SCALE;

const toShot = (image: Buffer): Promise<Buffer> =>
  sharp(image)
    .resize({
      width: REEL_SIZE.width * SHOT_SCALE,
      height: REEL_SIZE.height * SHOT_SCALE,
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 90 })
    .toBuffer();

const BLACK_SHOT = () =>
  sharp({
    create: {
      width: REEL_SIZE.width * SHOT_SCALE,
      height: REEL_SIZE.height * SHOT_SCALE,
      channels: 3,
      background: "#000000",
    },
  })
    .jpeg()
    .toBuffer();

// Everything the line-up reel needs: a poster shot and a card per
// screening, the hook captions and the end card.
export const renderReelAssets = async (
  lineup: Screening[],
  hookLines: [string, string]
) => {
  const posters = await Promise.all(lineup.map(fetchReelPoster));
  const shots = await Promise.all(
    posters.map((poster) => (poster ? toShot(poster) : BLACK_SHOT()))
  );

  const png = (element: Parameters<typeof satori>[0]) =>
    renderElement(element, REEL_SIZE, "png");
  const [hookFirst, hookFull, end, ...items] = await Promise.all([
    png(<ReelCaption lines={hookLines.slice(0, 1)} />),
    png(<ReelCaption lines={hookLines} />),
    renderElement(<ReelEnd />, REEL_SIZE),
    ...lineup.map((screening, index) =>
      png(
        <ReelLineupItem screening={screening} index={index} total={lineup.length} />
      )
    ),
  ]);

  return { shots, hookFirst: hookFirst!, hookFull: hookFull!, items, end: end! };
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
