import satori from "satori";
import sharp from "sharp";
import type { Screening } from "../types/types";
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
const resolveImageUrl = (value: string): string =>
  value.startsWith("/") ? `https://image.tmdb.org/t/p/original${value}` : value;

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

const renderElementToJpeg = async (
  element: Parameters<typeof satori>[0],
  size: { width: number; height: number }
): Promise<Buffer> => {
  const svg = await satori(element, {
    width: size.width,
    height: size.height,
    fonts: await loadFonts(),
  });

  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
};

export const renderScreeningImage = async (
  variant: Variant,
  screening: Screening
): Promise<Buffer> => {
  const layout = LAYOUTS[variant];
  const { backdropUrl, posterUrl } = screening.movie;
  const rawUrl = backdropUrl ?? posterUrl;
  const imageUrl = rawUrl
    ? await fetchImageAsDataUrl(resolveImageUrl(rawUrl))
    : null;

  return renderElementToJpeg(
    <ScreeningImage screening={screening} imageUrl={imageUrl} variant={variant} />,
    layout
  );
};
