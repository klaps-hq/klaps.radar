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

export type PostRange = { dateFrom: string; dateTo: string };

// What a slot will publish: the chosen screening (the one reserved), the
// candidates it came from (carousel line-up), and the reel plan for reels.
export type PreparedPost = {
  platform: Platform;
  candidate: Screening;
  candidates: Screening[];
  range: PostRange;
  reelPlan?: ReelPlan;
};

export type PrepareResult =
  | { ok: true; post: PreparedPost }
  | { ok: false; reason: string };

export type RenderedPost = {
  media: { buffer: Buffer; kind: "image" | "video" }[];
  caption: string | null;
  // Screenings whose cinemas get tagged.
  tagged: Screening[];
};

// "<title>|<year>" - a movie across its screenings (same key as the art cache).
export const movieKey = (screening: Screening): string =>
  `${screening.movie.title}|${screening.movie.productionYear}`;

/**
 * Picks what a slot publishes: the candidate API (quality bar, dedupe,
 * cooldown), then the format rules (carousel line-up size, reel plan).
 * `exclude` drops movies already used by earlier slots of a plan that the
 * API cannot know about yet (see src/plan.ts); publishing passes none.
 */
export const prepareSocialMedia = async (
  platform: Platform,
  config: Omit<FetchCandidateConfig, "platform"> & { reelKind?: ReelKind },
  exclude: Set<string> = new Set()
): Promise<PrepareResult> => {
  const { reelKind, ...query } = config;
  const response = await fetchCandidate({ ...query, platform });
  const candidates = response.candidates.filter((c) => !exclude.has(movieKey(c)));
  let candidate = candidates[0];

  // A no-op is not a failure: the range may already have a published post
  // (dedupe) or simply no screening clears the quality bar today.
  if (!response.publish || !candidate) {
    const detail =
      response.reason === "NO_HIGH_QUALITY_CANDIDATE"
        ? ` (bestScore: ${response.meta.bestScore}, minScore: ${response.meta.minScore})`
        : "";
    return {
      ok: false,
      reason: response.publish ? "CANDIDATES_USED_EARLIER" : `${response.reason}${detail}`,
    };
  }

  if (
    platform === "instagram_carousel" &&
    pickWeeklyLineup(candidates).length < MIN_CAROUSEL_SCREENINGS
  ) {
    return {
      ok: false,
      reason: `fewer than ${MIN_CAROUSEL_SCREENINGS} distinct screenings this week`,
    };
  }

  // A reel picks its own film (or line-up) for its series; that screening
  // is the one reserved.
  let reelPlan: ReelPlan | undefined;
  if (platform === "instagram_reel") {
    const plan = await planReel(reelKind ?? "weekend", candidates);
    if (!plan) {
      return {
        ok: false,
        reason: `fewer than ${MIN_LINEUP_SCREENINGS} distinct screenings (${reelKind})`,
      };
    }
    reelPlan = plan;
    candidate = plan.featured;
  }

  return {
    ok: true,
    post: {
      platform,
      candidate,
      candidates,
      range: { dateFrom: response.date.from, dateTo: response.date.to },
      reelPlan,
    },
  };
};

/**
 * Renders a prepared post and writes its caption, exactly as it goes out.
 * `still` renders a reel as a single frame instead of the video (previews).
 */
export const renderSocialMedia = async (
  post: PreparedPost,
  options: { still?: boolean } = {}
): Promise<RenderedPost> => {
  const { platform, candidate } = post;
  switch (platform) {
    case "instagram_reel": {
      const reel = await renderReelPlan(post.reelPlan!, { still: options.still });
      return {
        media: [{ buffer: reel.video, kind: options.still ? "image" : "video" }],
        caption: reel.caption,
        tagged: reel.tagged,
      };
    }
    case "instagram_carousel": {
      const lineup = pickWeeklyLineup(post.candidates);
      const slides = await renderCarouselImages(lineup, post.range);
      return {
        media: slides.map((buffer) => ({ buffer, kind: "image" as const })),
        caption: buildCarouselCaption(lineup),
        tagged: lineup,
      };
    }
  }

  const isStory =
    platform === "instagram_story" || platform === "facebook_story";
  const image = await renderScreeningImage(isStory ? "story" : "post", candidate);
  const caption =
    platform === "facebook_post"
      ? buildCaption(candidate)
      : platform === "threads_post"
        ? // Threads caps post text at 500 characters and honours only a
          // single tag per post, so hashtags would be dead weight that pushes
          // the caption over the limit.
          truncateText(buildCaption(candidate, { hashtags: false }), 490)
        : isStory
          ? null
          : buildCaption(candidate, { mentionCinema: true });
  return { media: [{ buffer: image, kind: "image" }], caption, tagged: [candidate] };
};

// Uploads a rendered post and publishes it; returns the media id and the
// hosted URL of the (first) file for the log.
const publishToPlatform = async (
  post: PreparedPost,
  rendered: RenderedPost
): Promise<{ mediaId: string; mediaUrl: string }> => {
  const { platform, candidate } = post;
  const urls = await Promise.all(
    rendered.media.map((m) => uploadTemporaryMedia(m.buffer, m.kind))
  );
  const mediaUrl = urls[0]!;
  const caption = rendered.caption ?? undefined;

  switch (platform) {
    case "instagram_reel": {
      await refreshInstagramToken();
      // Reels take user tags and collaborators like posts; the cinemas in
      // the reel are tagged (up to Instagram's limits), no location.
      const usernames = [
        ...new Set(
          rendered.tagged
            .map((s) => s.cinema.instagramUsername)
            .filter((u): u is string => Boolean(u))
        ),
      ];
      const collaborators = rendered.tagged
        .filter((s) => s.cinema.instagramUsername && s.cinema.instagramCollab)
        .map((s) => s.cinema.instagramUsername!);
      const mediaId = await publishInstagramReel({
        videoUrl: mediaUrl,
        caption: caption ?? "",
        userTags: usernames.length ? usernames : undefined,
        collaborators: collaborators.length
          ? [...new Set(collaborators)].slice(0, 3)
          : undefined,
      });
      return { mediaId, mediaUrl };
    }
    case "instagram_carousel": {
      await refreshInstagramToken();
      const lineup = rendered.tagged;
      const collaborators = lineup
        .filter((s) => s.cinema.instagramUsername && s.cinema.instagramCollab)
        .map((s) => s.cinema.instagramUsername!);
      // Slide 1 is the cover and the last one the outro; each screening
      // slide in between is tagged with its own cinema.
      const mediaId = await publishInstagramCarousel({
        slides: urls.map((imageUrl, i) => {
          const username = lineup[i - 1]?.cinema.instagramUsername;
          return { imageUrl, userTags: username ? [username] : undefined };
        }),
        caption: caption ?? "",
        collaborators: [...new Set(collaborators)].slice(0, 3),
      });
      return { mediaId, mediaUrl };
    }
    case "facebook_post":
      return {
        mediaId: await publishFacebookPhoto({ imageUrl: mediaUrl, caption: caption ?? "" }),
        mediaUrl,
      };
    case "facebook_story":
      return { mediaId: await publishFacebookStory({ imageUrl: mediaUrl }), mediaUrl };
    case "threads_post":
      await refreshThreadsToken();
      return {
        mediaId: await publishThreadsImage({ imageUrl: mediaUrl, text: caption ?? "" }),
        mediaUrl,
      };
    default: {
      await refreshInstagramToken();
      const isStory = platform === "instagram_story";
      return {
        mediaId: await publishInstagramImage({
          imageUrl: mediaUrl,
          story: isStory,
          caption,
          ...(isStory ? {} : getFeedEnrichment(candidate)),
        }),
        mediaUrl,
      };
    }
  }
};

export const createSocialMedia = async (
  platform: Platform,
  config: Omit<FetchCandidateConfig, "platform"> & { reelKind?: ReelKind }
): Promise<{ mediaId: string; mediaUrl: string } | null> => {
  const prepared = await prepareSocialMedia(platform, config);
  if (!prepared.ok) {
    console.log(
      `Skipping ${platform} for ${config.dateFrom}..${config.dateTo}: ${prepared.reason}`
    );
    return null;
  }
  const { post } = prepared;

  // Reserve before publishing so a re-run cannot post the same screening
  // twice, even if a later step fails. A carousel reserves its top-scored
  // screening, which is always the first pick of its line-up.
  await reserveCandidate(post.candidate.id, platform);

  const rendered = await renderSocialMedia(post);
  const { mediaId, mediaUrl } = await publishToPlatform(post, rendered);

  await markCandidateAsPublished(post.candidate.id, platform);

  console.log(`Published ${platform} (media ${mediaId}): ${mediaUrl}`);
  return { mediaId, mediaUrl };
};
