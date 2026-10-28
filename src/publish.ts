import { publishFacebookPhoto, publishFacebookStory } from "./facebook";
import {
  publishInstagramCarousel,
  publishInstagramImage,
  publishInstagramReel,
  refreshInstagramToken,
  type FeedEnrichment,
} from "./instagram";
import { publishThreadsImage, refreshThreadsToken } from "./threads";
import { API_URL, INTERNAL_API_KEY } from "./constants/env";
import { renderCarouselImages, renderScreeningImage } from "./render/render";
import { planReel, renderReelPlan, MIN_LINEUP_SCREENINGS, type ReelKind, type ReelPlan } from "./reels";
import type {
  FetchCandidateConfig,
  Platform,
  Screening,
} from "./types/types";
import { buildCaption, buildCarouselCaption } from "./utils/caption";
import {
  fetchCandidate,
  markCandidateAsPublished,
  reserveCandidate,
} from "./utils/candidate";
import { truncateText } from "./utils/format";
import { pickWeeklyLineup } from "./utils/lineup";

// Fewer than this and the weekly carousel is skipped for the week.
const MIN_CAROUSEL_SCREENINGS = 3;

// Instagram fetches media from a public URL, so the rendered image (or reel
// video) is parked in our own API (GET /socials/image/:id is public) just
// long enough for the Graph API to ingest it; the API prunes stale files.
export const uploadTemporaryMedia = async (
  buffer: Buffer,
  kind: "image" | "video" = "image"
): Promise<string> => {
  if (!API_URL || !INTERNAL_API_KEY) {
    throw new Error("API_URL and INTERNAL_API_KEY must be set");
  }

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(buffer)], {
      type: kind === "video" ? "video/mp4" : "image/jpeg",
    }),
    kind === "video" ? "reel.mp4" : "post.jpg"
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

// The Instagram feed caption, exposed for the design preview script.
export const buildCaptionPreview = (screening: Screening): string =>
  buildCaption(screening, { mentionCinema: true });

const getFeedEnrichment = (screening: Screening): FeedEnrichment => {
  const { instagramUsername, instagramCollab, facebookPlaceId } =
    screening.cinema;
  return {
    userTags: instagramUsername ? [instagramUsername] : undefined,
    collaborators:
      instagramUsername && instagramCollab ? [instagramUsername] : undefined,
    locationId: facebookPlaceId ?? undefined,
  };
};

// Renders, uploads and publishes one item; returns the media id and the
// hosted URL of the (first) rendered file for the log.
const publishToPlatform = async (
  platform: Platform,
  candidate: Screening,
  candidates: Screening[],
  range: { dateFrom: string; dateTo: string },
  reelPlan?: ReelPlan
): Promise<{ mediaId: string; mediaUrl: string }> => {
  switch (platform) {
    case "instagram_reel": {
      await refreshInstagramToken();
      const reel = await renderReelPlan(reelPlan!);
      const videoUrl = await uploadTemporaryMedia(reel.video, "video");
      // Reels take user tags and collaborators like posts; the cinemas in
      // the reel are tagged (up to Instagram's limits), no location.
      const usernames = [
        ...new Set(
          reel.tagged
            .map((s) => s.cinema.instagramUsername)
            .filter((u): u is string => Boolean(u))
        ),
      ];
      const collaborators = reel.tagged
        .filter((s) => s.cinema.instagramUsername && s.cinema.instagramCollab)
        .map((s) => s.cinema.instagramUsername!);
      const mediaId = await publishInstagramReel({
        videoUrl,
        caption: reel.caption,
        userTags: usernames.length ? usernames : undefined,
        collaborators: collaborators.length
          ? [...new Set(collaborators)].slice(0, 3)
          : undefined,
      });
      return { mediaId, mediaUrl: videoUrl };
    }
    case "instagram_carousel": {
      await refreshInstagramToken();
      const lineup = pickWeeklyLineup(candidates);
      const slides = await renderCarouselImages(lineup, range);
      const slideUrls = await Promise.all(
        slides.map((slide) => uploadTemporaryMedia(slide))
      );
      const collaborators = lineup
        .filter((s) => s.cinema.instagramUsername && s.cinema.instagramCollab)
        .map((s) => s.cinema.instagramUsername!);
      // Slide 1 is the cover and the last one the outro; each screening
      // slide in between is tagged with its own cinema.
      const mediaId = await publishInstagramCarousel({
        slides: slideUrls.map((imageUrl, i) => {
          const username = lineup[i - 1]?.cinema.instagramUsername;
          return { imageUrl, userTags: username ? [username] : undefined };
        }),
        caption: buildCarouselCaption(lineup),
        collaborators: [...new Set(collaborators)].slice(0, 3),
      });
      return { mediaId, mediaUrl: slideUrls[0]! };
    }
  }

  const isStory =
    platform === "instagram_story" || platform === "facebook_story";
  const imageUrl = await uploadTemporaryMedia(
    await renderScreeningImage(isStory ? "story" : "post", candidate)
  );

  switch (platform) {
    case "facebook_post":
      return {
        mediaId: await publishFacebookPhoto({
          imageUrl,
          caption: buildCaption(candidate),
        }),
        mediaUrl: imageUrl,
      };
    case "facebook_story":
      return {
        mediaId: await publishFacebookStory({ imageUrl }),
        mediaUrl: imageUrl,
      };
    case "threads_post":
      await refreshThreadsToken();
      // Threads caps post text at 500 characters and honours only a single
      // tag per post, so hashtags would be dead weight that pushes the
      // caption over the limit.
      return {
        mediaId: await publishThreadsImage({
          imageUrl,
          text: truncateText(buildCaption(candidate, { hashtags: false }), 490),
        }),
        mediaUrl: imageUrl,
      };
    default:
      await refreshInstagramToken();
      return {
        mediaId: await publishInstagramImage({
          imageUrl,
          story: isStory,
          caption: isStory
            ? undefined
            : buildCaption(candidate, { mentionCinema: true }),
          ...(isStory ? {} : getFeedEnrichment(candidate)),
        }),
        mediaUrl: imageUrl,
      };
  }
};

export const createSocialMedia = async (
  platform: Platform,
  config: Omit<FetchCandidateConfig, "platform"> & { reelKind?: ReelKind }
): Promise<void> => {
  const { reelKind, ...query } = config;
  const response = await fetchCandidate({ ...query, platform });
  let candidate = response.candidates[0];

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

  if (
    platform === "instagram_carousel" &&
    pickWeeklyLineup(response.candidates).length < MIN_CAROUSEL_SCREENINGS
  ) {
    console.log(
      `Skipping ${platform}: fewer than ${MIN_CAROUSEL_SCREENINGS} distinct screenings this week`
    );
    return;
  }

  // A reel picks its own film (or line-up) for its series; that screening
  // is the one reserved.
  let reelPlan: ReelPlan | undefined;
  if (platform === "instagram_reel") {
    const plan = await planReel(reelKind ?? "weekend", response.candidates);
    if (!plan) {
      console.log(
        `Skipping ${platform} (${reelKind}): fewer than ${MIN_LINEUP_SCREENINGS} distinct screenings`
      );
      return;
    }
    reelPlan = plan;
    candidate = plan.featured;
  }

  // Reserve before publishing so a re-run cannot post the same screening
  // twice, even if a later step fails. A carousel reserves its top-scored
  // screening, which is always the first pick of its line-up.
  await reserveCandidate(candidate.id, platform);

  const { mediaId, mediaUrl } = await publishToPlatform(
    platform,
    candidate,
    response.candidates,
    { dateFrom: response.date.from, dateTo: response.date.to },
    reelPlan
  );

  await markCandidateAsPublished(candidate.id, platform);

  console.log(`Published ${platform} (media ${mediaId}): ${mediaUrl}`);
};
