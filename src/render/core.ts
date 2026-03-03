import puppeteer from "puppeteer";
import type { Browser, Page } from "puppeteer";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export type TemplateRenderPayload = Record<string, unknown>;

export type CanvasSize = {
  width: number;
  height: number;
};

export type RenderImageInput = {
  templateKey: string;
  payload: TemplateRenderPayload;
};

export type RenderImageOptions = {
  renderStudioUrl?: string;
  timeoutMs?: number;
  captureMode?: boolean;
  canvasSize?: CanvasSize;
};

const DEFAULT_RENDER_STUDIO_URL = "http://127.0.0.1:6543";
const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 1080, height: 1350 };

const CHROME_PROFILE_PREFIX = "puppeteer_dev_chrome_profile-";
const PROFILE_CLEANUP_RETRIES = 6;
const PROFILE_CLEANUP_DELAY_MS = 150;

const base64UrlEncode = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");

const removeDirectoryWithRetry = async (
  directoryPath: string
): Promise<void> => {
  for (let attempt = 0; attempt <= PROFILE_CLEANUP_RETRIES; attempt += 1) {
    try {
      await rm(directoryPath, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      const isLastAttempt = attempt === PROFILE_CLEANUP_RETRIES;
      const isBusyError =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error.code === "EBUSY" ||
          error.code === "EPERM" ||
          error.code === "ENOTEMPTY");

      if (isLastAttempt || !isBusyError) {
        throw error;
      }

      await sleep(PROFILE_CLEANUP_DELAY_MS * (attempt + 1));
    }
  }
};

const buildRenderStudioTemplateUrl = (
  input: RenderImageInput,
  renderStudioUrl: string,
  captureMode: boolean
): string => {
  const url = new URL(renderStudioUrl);
  url.searchParams.set("template", input.templateKey);
  if (captureMode) {
    url.searchParams.set("capture", "1");
  }
  url.searchParams.set("data", base64UrlEncode(JSON.stringify(input.payload)));
  return url.toString();
};

const waitForAllImagesToSettle = async (
  page: Page,
  timeoutMs: number
): Promise<void> => {
  await page.evaluate(async (pageTimeoutMs) => {
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
  }, timeoutMs);
};

export const renderImage = async (
  input: RenderImageInput,
  options?: RenderImageOptions
): Promise<Buffer> => {
  const renderStudioUrl =
    options?.renderStudioUrl ??
    process.env.RENDER_STUDIO_URL ??
    DEFAULT_RENDER_STUDIO_URL;
  const timeoutMs = options?.timeoutMs ?? 30000;
  const canvasSize = options?.canvasSize ?? DEFAULT_CANVAS_SIZE;
  const captureMode = options?.captureMode ?? true;
  const pageUrl = buildRenderStudioTemplateUrl(
    input,
    renderStudioUrl,
    captureMode
  );

  const profileDirectory = await mkdtemp(join(tmpdir(), CHROME_PROFILE_PREFIX));
  let browser: Browser | undefined;

  try {
    const healthCheck = await fetch(renderStudioUrl, {
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    if (!healthCheck?.ok) {
      throw new Error(
        `Render studio not reachable at ${renderStudioUrl}. Start it with: cd render-studio && bun run dev`
      );
    }

    browser = await puppeteer.launch({
      headless: true,
      userDataDir: profileDirectory,
    });

    const page = await browser.newPage();
    await page.setViewport({ ...canvasSize, deviceScaleFactor: 1 });
    await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: timeoutMs });
    let readyElement;
    try {
      readyElement = await page.waitForSelector(
        "[data-template-ready='true']",
        { timeout: timeoutMs }
      );
    } catch (err) {
      const errorEl = await page.$("[data-template-status='error']").catch(() => null);
      const errorText = errorEl
        ? await errorEl.evaluate((el) => el.textContent?.trim() ?? "Unknown error").catch(() => "Unknown error")
        : "Template did not become ready in time. Ensure render-studio is running (cd render-studio && bun run dev) and the template payload is valid.";
      await errorEl?.dispose();
      throw new Error(`Waiting for template ready failed: ${errorText}`, { cause: err });
    }

    const templateStatus = await readyElement?.evaluate(
      (el) => el.getAttribute("data-template-status")
    );
    if (templateStatus === "error") {
      const errorText = await page.evaluate(
        () => document.querySelector("[data-template-ready='true']")?.textContent?.trim() ?? "Unknown error"
      );
      throw new Error(`Template render failed: ${errorText}`);
    }

    await waitForAllImagesToSettle(page, timeoutMs);

    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: 92,
      clip: { x: 0, y: 0, ...canvasSize },
    });

    return Buffer.from(screenshot);
  } finally {
    if (browser) {
      await browser.close();
    }
    await removeDirectoryWithRetry(profileDirectory);
  }
};

export const generateAndSaveTemplateImage = async (
  input: RenderImageInput,
  outputPath: string,
  options?: RenderImageOptions
): Promise<void> => {
  const imageBuffer = await renderImage(input, options);
  await Bun.write(outputPath, imageBuffer);
};

export const saveImage = generateAndSaveTemplateImage;
