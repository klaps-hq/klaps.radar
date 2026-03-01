import puppeteer from "puppeteer";
import type { Page } from "puppeteer";
import type { InstagramCandidateResponse } from "./types/instagram.types";

export type InstagramFeedPostTemplatePayload = {
  title: string;
  description: string;
  cinemaName: string;
  cinemaAddress: string;
  screeningDateLabel: string;
  ratingLabel: string;
  posterUrl: string;
  backdropUrl: string;
  ctaLabel: string;
};

type RenderInstagramPostOptions = {
  renderStudioUrl?: string;
  timeoutMs?: number;
};

const TEMPLATE_KEY = "instagram.feed.post";
const DEFAULT_RENDER_STUDIO_URL = "http://127.0.0.1:5173";
const CANVAS_SIZE = { width: 1080, height: 1350 } as const;

const base64UrlEncode = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");

const buildRenderStudioPostUrl = (
  payload: InstagramFeedPostTemplatePayload,
  renderStudioUrl: string
): string => {
  const url = new URL(renderStudioUrl);
  url.searchParams.set("template", TEMPLATE_KEY);
  url.searchParams.set("capture", "1");
  url.searchParams.set("data", base64UrlEncode(JSON.stringify(payload)));
  return url.toString();
};

const waitForAllImagesToSettle = async (
  page: Page,
  timeoutMs: number
): Promise<void> => {
  await page.evaluate(
    async (pageTimeoutMs) => {
      const pendingImages = Array.from(document.images).filter(
        (image) => !image.complete
      );

      if (pendingImages.length === 0) {
        return;
      }

      await Promise.race([
        Promise.all(
          pendingImages.map(
            (image) =>
              new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              })
          )
        ),
        new Promise<void>((resolve) => {
          setTimeout(() => resolve(), pageTimeoutMs);
        }),
      ]);
    },
    timeoutMs
  );
};

export const buildInstagramFeedPostPayloadFromCandidate = (
  candidate: InstagramCandidateResponse
): InstagramFeedPostTemplatePayload => {
  if (!candidate.movie || !candidate.screening) {
    throw new Error("Candidate payload is missing movie or screening details.");
  }

  const posterUrl = candidate.movie.posterUrl ?? candidate.movie.backdropUrl;
  const backdropUrl = candidate.movie.backdropUrl ?? candidate.movie.posterUrl;

  if (!posterUrl || !backdropUrl) {
    throw new Error("Candidate payload is missing poster and backdrop URLs.");
  }

  const { movie, screening } = candidate;
  return {
    title: `${movie.title} (${movie.productionYear})`,
    description: movie.description,
    cinemaName: screening.cinema.name,
    cinemaAddress: `${screening.cinema.street}, ${screening.cinema.city.name}`,
    screeningDateLabel: `${screening.date}, godz. ${screening.time}`,
    ratingLabel: "16+",
    posterUrl,
    backdropUrl,
    ctaLabel: "Sprawdz seans",
  };
};

export const renderInstagramFeedPostImage = async (
  payload: InstagramFeedPostTemplatePayload,
  options?: RenderInstagramPostOptions
): Promise<Buffer> => {
  const renderStudioUrl =
    options?.renderStudioUrl ??
    process.env.RENDER_STUDIO_URL ??
    DEFAULT_RENDER_STUDIO_URL;
  const timeoutMs = options?.timeoutMs ?? 15000;
  const pageUrl = buildRenderStudioPostUrl(payload, renderStudioUrl);

  const browser = await puppeteer.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ ...CANVAS_SIZE, deviceScaleFactor: 1 });
    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: timeoutMs });
    await page.waitForSelector("[data-template-ready='true']", {
      timeout: timeoutMs,
    });
    await waitForAllImagesToSettle(page, timeoutMs);

    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: 92,
      clip: { x: 0, y: 0, ...CANVAS_SIZE },
    });

    return Buffer.from(screenshot);
  } finally {
    await browser.close();
  }
};

export const generateAndSaveInstagramFeedPostImage = async (
  payload: InstagramFeedPostTemplatePayload,
  outputPath: string,
  options?: RenderInstagramPostOptions
): Promise<void> => {
  const imageBuffer = await renderInstagramFeedPostImage(payload, options);
  await Bun.write(outputPath, imageBuffer);
};
