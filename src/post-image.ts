import sharp from "sharp";

const POST_LAYOUT = {
  width: 1080,
  height: 1350,
  padding: 60,
} as const;

const STORY_LAYOUT = {
  width: 1080,
  height: 1920,
  padding: 100,
} as const;
const STORY_VERTICAL_OFFSET = 128;
const STORY_POSTER_SCALE = 0.88;

const CORNER_LENGTH = 80;
const CORNER_THICKNESS = 4;
const CORNER_MARGIN = 32;
const STORY_CORNER_LENGTH = 60;
const STORY_CORNER_THICKNESS = 3;
const STORY_BOTTOM_CORNER_OFFSET = 0;
const BACKDROP_BLUR_SIGMA = 24;
const BACKDROP_DARKEN_OPACITY = 0.65;
const RED = "#dc1301";

type PosterRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PostImageOptions = {
  posterUrl: string;
  backdropUrl?: string;
  layout?: "post" | "story";
  storyInfo?: {
    title: string;
    facts: string[];
  };
};

const resolveLayout = (layout: PostImageOptions["layout"]) =>
  layout === "story" ? STORY_LAYOUT : POST_LAYOUT;

const buildCornersSvg = (
  poster: PosterRect,
  canvas: { width: number; height: number },
  options?: { bottomOffset?: number; isStory?: boolean }
): string => {
  const bottomOffset = options?.bottomOffset ?? 0;
  const isStory = options?.isStory ?? false;
  const length = isStory ? STORY_CORNER_LENGTH : CORNER_LENGTH;
  const thickness = isStory ? STORY_CORNER_THICKNESS : CORNER_THICKNESS;
  const opacity = isStory ? 0.6 : 1;
  const x1 = poster.left - CORNER_MARGIN;
  const y1 = poster.top - CORNER_MARGIN;
  const x2 = poster.left + poster.width + CORNER_MARGIN;
  const y2 = poster.top + poster.height + CORNER_MARGIN + bottomOffset;

  return `<svg width="${canvas.width}" height="${
    canvas.height
  }" xmlns="http://www.w3.org/2000/svg">
    <line x1="${x1}" y1="${y1}" x2="${
    x1 + length
  }" y2="${y1}" stroke="${RED}" stroke-width="${thickness}" stroke-linecap="square" opacity="${opacity}"/>
    <line x1="${x1}" y1="${y1}" x2="${x1}" y2="${
    y1 + length
  }" stroke="${RED}" stroke-width="${thickness}" stroke-linecap="square" opacity="${opacity}"/>
    <line x1="${x2}" y1="${y2}" x2="${
    x2 - length
  }" y2="${y2}" stroke="${RED}" stroke-width="${thickness}" stroke-linecap="square" opacity="${opacity}"/>
    <line x1="${x2}" y1="${y2}" x2="${x2}" y2="${
    y2 - length
  }" stroke="${RED}" stroke-width="${thickness}" stroke-linecap="square" opacity="${opacity}"/>
  </svg>`;
};

const buildDarkenOverlay = (canvas: {
  width: number;
  height: number;
}): Buffer => {
  const opacity = Math.round(BACKDROP_DARKEN_OPACITY * 255);
  const svg = `<svg width="${canvas.width}" height="${
    canvas.height
  }" xmlns="http://www.w3.org/2000/svg">
    <rect width="${canvas.width}" height="${
    canvas.height
  }" fill="rgb(0,0,0)" fill-opacity="${opacity / 255}"/>
  </svg>`;
  return Buffer.from(svg);
};

const escapeSvgText = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const trimToLength = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trim()}...`;
};

const buildStoryInfoOverlay = (
  canvas: { width: number; height: number },
  poster: PosterRect,
  storyInfo: NonNullable<PostImageOptions["storyInfo"]>
): Buffer => {
  const title = escapeSvgText(trimToLength(storyInfo.title, 56));
  const facts = storyInfo.facts
    .filter((fact) => fact.trim().length > 0)
    .slice(0, 4)
    .map((fact) => escapeSvgText(trimToLength(fact, 60)));

  const textX = Math.max(48, poster.left);
  const gradientHeight = 520;
  const titleY = Math.min(canvas.height - 340, poster.top + poster.height + 96);
  let currentY = titleY + 80;

  const firstFact = facts[0];
  const restFacts = facts.slice(1);
  const boldFactLine = firstFact
    ? `<text x="${textX}" y="${currentY}" fill="#ffffff" font-size="42" font-weight="700" font-family="Arial, Helvetica, sans-serif">${firstFact}</text>`
    : "";
  currentY += 56;

  const restFactLines = restFacts
    .map((fact) => {
      const line = `<text x="${textX}" y="${currentY}" fill="#ffffff" font-size="42" font-family="Arial, Helvetica, sans-serif">${fact}</text>`;
      currentY += 52;
      return line;
    })
    .join("");

  currentY += 20;
  const ctaLine = `<text x="${textX}" y="${currentY}" fill="${RED}" font-size="34" font-weight="700" font-family="Arial, Helvetica, sans-serif">klaps.space</text>`;

  const svg = `<svg width="${canvas.width}" height="${
    canvas.height
  }" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="storyGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,0,0,0)" />
        <stop offset="30%" stop-color="rgba(0,0,0,0.3)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.88)" />
      </linearGradient>
      <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.9"/>
      </filter>
    </defs>
    <rect x="0" y="${canvas.height - gradientHeight}" width="${
    canvas.width
  }" height="${gradientHeight}" fill="url(#storyGradient)"/>
    <text x="${textX}" y="${titleY}" fill="#ffffff" font-size="64" font-weight="700" font-family="Arial, Helvetica, sans-serif" filter="url(#textShadow)">${title}</text>
    ${boldFactLine}
    ${restFactLines}
    ${ctaLine}
  </svg>`;
  return Buffer.from(svg);
};

const downloadImage = async (url: string): Promise<Buffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image from ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const createBlurredBackdrop = async (
  backdropBuffer: Buffer,
  canvas: { width: number; height: number }
): Promise<Buffer> => {
  const blurred = await sharp(backdropBuffer)
    .resize(canvas.width, canvas.height, { fit: "cover" })
    .blur(BACKDROP_BLUR_SIGMA)
    .toBuffer();

  return await sharp(blurred)
    .composite([{ input: buildDarkenOverlay(canvas), blend: "over" }])
    .toBuffer();
};

const createBlackBackground = async (canvas: {
  width: number;
  height: number;
}): Promise<Buffer> => {
  return await sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer();
};

export const generatePostImage = async (
  options: PostImageOptions
): Promise<Buffer> => {
  const canvas = resolveLayout(options.layout);
  const posterBuffer = await downloadImage(options.posterUrl);

  const backdropBuffer = options.backdropUrl
    ? await downloadImage(options.backdropUrl).catch(() => null)
    : null;

  const background = backdropBuffer
    ? await createBlurredBackdrop(backdropBuffer, canvas)
    : await createBlackBackground(canvas);

  const isStory = options.layout === "story";
  const maxWidth = canvas.width - canvas.padding * 2;
  const baseMaxHeight = canvas.height - canvas.padding * 2;
  const maxHeight = isStory
    ? Math.round(baseMaxHeight * STORY_POSTER_SCALE)
    : baseMaxHeight;

  const resizedPoster = await sharp(posterBuffer)
    .resize(maxWidth, maxHeight, { fit: "inside" })
    .toBuffer();

  const posterMeta = await sharp(resizedPoster).metadata();
  const posterWidth = posterMeta.width ?? maxWidth;
  const posterHeight = posterMeta.height ?? maxHeight;

  const left = Math.round((canvas.width - posterWidth) / 2);
  const centeredTop = Math.round((canvas.height - posterHeight) / 2);
  const top = isStory
    ? Math.max(canvas.padding, centeredTop - STORY_VERTICAL_OFFSET)
    : centeredTop;

  const cornersSvg = Buffer.from(
    buildCornersSvg(
      { left, top, width: posterWidth, height: posterHeight },
      canvas,
      isStory
        ? { bottomOffset: STORY_BOTTOM_CORNER_OFFSET, isStory: true }
        : undefined
    )
  );

  const posterShadow = await sharp(resizedPoster)
    .resize(posterWidth + 8, posterHeight + 8, { fit: "fill" })
    .blur(12)
    .modulate({ brightness: 0.2 })
    .ensureAlpha(0.6)
    .toBuffer();

  const shadowLeft = left - 4;
  const shadowTop = top - 4;

  const image = await sharp(background)
    .composite(
      [
        { input: posterShadow, left: shadowLeft, top: shadowTop },
        { input: resizedPoster, left, top },
        isStory && options.storyInfo
          ? {
              input: buildStoryInfoOverlay(
                canvas,
                { left, top, width: posterWidth, height: posterHeight },
                options.storyInfo
              ),
              left: 0,
              top: 0,
            }
          : null,
        { input: cornersSvg, left: 0, top: 0 },
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    )
    .jpeg({ quality: 92 })
    .toBuffer();

  return image;
};

export const generateAndSavePostImage = async (
  options: PostImageOptions,
  outputPath: string
): Promise<void> => {
  const imageBuffer = await generatePostImage(options);
  await Bun.write(outputPath, imageBuffer);
};

export const uploadPostImage = async (imageBuffer: Buffer): Promise<string> => {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("time", "24h");
  formData.append(
    "fileToUpload",
    new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" }),
    "post.jpg"
  );

  const response = await fetch(
    "https://litterbox.catbox.moe/resources/internals/api.php",
    {
      method: "POST",
      headers: { "User-Agent": "klaps-radar/1.0" },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Image upload failed (status ${response.status}): ${errorText}`
    );
  }

  const url = await response.text();
  return url.trim();
};

export const createPublicPostImageUrl = async (
  options: PostImageOptions
): Promise<string> => {
  const imageBuffer = await generatePostImage(options);
  const publicUrl = await uploadPostImage(imageBuffer);
  return publicUrl;
};
