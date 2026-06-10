import { publishFacebookPhoto, publishFacebookStory } from "./facebook";
import { publishInstagramImage, refreshInstagramToken } from "./instagram";
import { publishThreadsImage, refreshThreadsToken } from "./threads";
import { API_URL, INTERNAL_API_KEY } from "./constants/env";
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
// in our own API (GET /socials/image/:id is public) just long enough for the
// Graph API to ingest it; the API prunes stale images automatically.
const uploadTemporaryImage = async (imageBuffer: Buffer): Promise<string> => {
  if (!API_URL || !INTERNAL_API_KEY) {
    throw new Error("API_URL and INTERNAL_API_KEY must be set");
  }

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" }),
    "post.jpg"
  );

  const response = await fetch(`${API_URL}/socials/image`, {
    method: "POST",
    headers: { "x-internal-api-key": INTERNAL_API_KEY },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Image upload failed (status ${response.status}): ${errorText}`
    );
  }

  const { id } = (await response.json()) as { id: string };
  return `${API_URL}/socials/image/${id}`;
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

export const createSocialMedia = async (
  platform: Platform,
  config: Omit<FetchCandidateConfig, "platform">
): Promise<void> => {
  const response = await fetchCandidate({ ...config, platform });
  const candidate = response.candidates[0];

  // A no-op is not a failure: the range may already have a published post
  // (dedupe) or simply no screening clears the quality bar today.
  if (!response.publish || !candidate) {
    const detail =
      response.reason === "NO_HIGH_QUALITY_CANDIDATE"
        ? ` (bestScore: ${response.meta.bestScore}, minScore: ${response.meta.minScore})`
        : "";
    console.log(
      `Skipping ${platform} for ${response.date.from}..${response.date.to}: ${response.reason}${detail}`
    );
    return;
  }

  // Reserve before publishing so a re-run cannot post the same screening
  // twice, even if a later step fails.
  await reserveCandidate(candidate.id, platform);

  const isStory =
    platform === "instagram_story" || platform === "facebook_story";
  const imageBuffer = await renderScreeningImage(
    isStory ? "story" : "post",
    candidate
  );
  const imageUrl = await uploadTemporaryImage(imageBuffer);

  let mediaId: string;

  switch (platform) {
    case "facebook_post":
      mediaId = await publishFacebookPhoto({
        imageUrl,
        caption: buildCaption(candidate),
      });
      break;
    case "facebook_story":
      mediaId = await publishFacebookStory({ imageUrl });
      break;
    case "threads_post":
      await refreshThreadsToken();
      // Threads caps post text at 500 characters.
      mediaId = await publishThreadsImage({
        imageUrl,
        text: truncateText(buildCaption(candidate), 490),
      });
      break;
    default:
      await refreshInstagramToken();
      mediaId = await publishInstagramImage({
        imageUrl,
        story: isStory,
        caption: isStory ? undefined : buildCaption(candidate),
      });
  }

  await markCandidateAsPublished(candidate.id, platform);

  console.log(`Published ${platform} (media ${mediaId}): ${imageUrl}`);
};

