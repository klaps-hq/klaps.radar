import { publishInstagramImage } from "./instagram";
import { renderScreeningImage } from "./render/render";
import type {
  FetchCandidateConfig,
  Platform,
  Screening,
} from "./types/types";
import {
  fetchCandidate,
  markCandidateAsPublished,
  reserveCandidate,
} from "./utils/candidate";
import {
  formatPolishDate,
  splitScreeningDate,
  truncateText,
} from "./utils/format";

// Instagram fetches media from a public URL, so the rendered image is parked
// on a 24h temporary host just long enough for the Graph API to ingest it.
const uploadTemporaryImage = async (imageBuffer: Buffer): Promise<string> => {
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

  return (await response.text()).trim();
};

const buildCaption = (screening: Screening): string => {
  const { movie, cinema } = screening;
  const { date, time } = splitScreeningDate(screening.date);

  return [
    `${movie.title} (${movie.productionYear})`,
    `${formatPolishDate(date)}${time ? `, godz. ${time}` : ""}`,
    `${cinema.name}, ${cinema.street}, ${cinema.city.name}`,
    ...(movie.description
      ? ["", truncateText(movie.description, 350)]
      : []),
    "",
    "Pełny repertuar kin studyjnych znajdziesz na klaps.space",
    "",
    "#klaps #kino #kinostudyjne #seans #film #klasykakina",
  ].join("\n");
};

export const createInstagramMedia = async (
  platform: Platform,
  config: Omit<FetchCandidateConfig, "platform">
): Promise<void> => {
  const { candidates } = await fetchCandidate({ ...config, platform });
  const candidate = candidates[0];

  if (!candidate) {
    throw new Error("No candidate found");
  }

  // Reserve before publishing so a re-run cannot post the same screening
  // twice, even if a later step fails.
  await reserveCandidate(candidate.id, platform);

  const isStory = platform === "instagram_story";
  const imageBuffer = await renderScreeningImage(
    isStory ? "story" : "post",
    candidate
  );
  const imageUrl = await uploadTemporaryImage(imageBuffer);

  const mediaId = await publishInstagramImage({
    imageUrl,
    story: isStory,
    caption: isStory ? undefined : buildCaption(candidate),
  });

  await markCandidateAsPublished(candidate.id, platform);

  console.log(`Published ${platform} (media ${mediaId}): ${imageUrl}`);
};
