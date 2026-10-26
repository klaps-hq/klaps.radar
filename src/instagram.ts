import { INSTAGRAM_API_VERSION, INSTAGRAM_GRAPH_URL } from "./constants";
import { resolveInstagramEnv } from "./utils/environment";
import { persistToken } from "./utils/token";
import { setTimeout as sleep } from "node:timers/promises";

const CONTAINER_POLL_ATTEMPTS = 10;
const CONTAINER_POLL_DELAY_MS = 1500;

type GraphError = { error?: { message?: string; code?: number } };

const graphUrl = (path: string): string =>
  `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${path}`;

const graphPost = async (
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> => {
  const { accessToken } = resolveInstagramEnv();
  const response = await fetch(graphUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: accessToken }),
  });

  const data = (await response.json()) as Record<string, unknown> & GraphError;

  if (!response.ok) {
    throw new Error(
      `Instagram API error (${path}): ${data.error?.message ?? response.statusText}`
    );
  }

  return data;
};

const getContainerStatus = async (containerId: string): Promise<string> => {
  const { accessToken } = resolveInstagramEnv();
  const url = new URL(graphUrl(containerId));
  url.searchParams.set("fields", "status_code");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const data = (await response.json()) as { status_code?: string } & GraphError;

  if (!response.ok) {
    throw new Error(
      `Instagram API error (container status): ${data.error?.message ?? response.statusText}`
    );
  }

  return data.status_code ?? "UNKNOWN";
};

// Long-lived Instagram tokens expire after ~60 days but can be refreshed
// any time once they are 24h old. Refreshing on every publish run keeps the
// token perpetually valid.
export const refreshInstagramToken = async (): Promise<void> => {
  const { accessToken } = resolveInstagramEnv();
  const url = new URL(`${INSTAGRAM_GRAPH_URL}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  } & GraphError;

  if (!response.ok || !data.access_token) {
    // Not fatal: a token younger than 24h cannot be refreshed yet and the
    // current one still works for this run.
    console.warn(
      `Token refresh skipped: ${data.error?.message ?? response.statusText}`
    );
    return;
  }

  await persistToken(
    data.access_token,
    "INSTAGRAM_ACCESS_TOKEN",
    "INSTAGRAM_TOKEN_FILE"
  );

  const validDays = Math.round((data.expires_in ?? 0) / 86400);
  console.log(`Instagram token refreshed (valid ~${validDays} days)`);
};

// Feed-only extras. They come from hand-maintained cinema data, so they
// are applied best-effort (see createContainer).
export type FeedEnrichment = {
  // Usernames tagged on the media (no consent needed).
  userTags?: string[];
  // Up to 3 usernames invited as collaborators.
  collaborators?: string[];
  // Facebook Page ID of a place.
  locationId?: string;
};

export type PublishImageOptions = FeedEnrichment & {
  imageUrl: string;
  caption?: string;
  story?: boolean;
};

const buildEnrichmentParams = (
  enrichment: FeedEnrichment,
  // Image tags need a position on the picture; video tags must not have one.
  positionedTags: boolean
): Record<string, string> => ({
  ...(enrichment.userTags?.length
    ? {
        user_tags: JSON.stringify(
          enrichment.userTags.map((username) =>
            positionedTags ? { username, x: 0.5, y: 0.5 } : { username }
          )
        ),
      }
    : {}),
  ...(enrichment.collaborators?.length
    ? { collaborators: JSON.stringify(enrichment.collaborators.slice(0, 3)) }
    : {}),
  ...(enrichment.locationId ? { location_id: enrichment.locationId } : {}),
});

// A stale username or place ID must not cost the whole post: on failure the
// container is created again with less. Location is the least certain field,
// so it is dropped first and the tags get a second chance on their own.
const createContainer = async (
  base: Record<string, string>,
  enrichment: Record<string, string> = {}
): Promise<string> => {
  const { instagramUserId } = resolveInstagramEnv();
  const { location_id: _location, ...tagsOnly } = enrichment;
  const attempts = [
    enrichment,
    ...(enrichment.location_id && Object.keys(tagsOnly).length ? [tagsOnly] : []),
    ...(Object.keys(enrichment).length ? [{}] : []),
  ];

  for (const [index, extra] of attempts.entries()) {
    try {
      const container = await graphPost(`${instagramUserId}/media`, {
        ...base,
        ...extra,
      });
      return String(container.id);
    } catch (err) {
      if (index === attempts.length - 1) throw err;
      console.warn(
        `Container rejected with ${Object.keys(extra).join(", ")}, retrying with less: ${(err as Error).message}`
      );
    }
  }

  throw new Error("unreachable");
};

// Images are ready within seconds; video is transcoded by Instagram and
// commonly takes a minute or more.
const waitForContainer = async (
  containerId: string,
  { attempts, delayMs }: { attempts: number; delayMs: number } = {
    attempts: CONTAINER_POLL_ATTEMPTS,
    delayMs: CONTAINER_POLL_DELAY_MS,
  }
): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await getContainerStatus(containerId);
    if (status === "FINISHED") return;
    if (status === "ERROR") {
      throw new Error(`Instagram could not process media container ${containerId}`);
    }
    await sleep(delayMs);
  }

  throw new Error(`Media container ${containerId} not ready in time`);
};

const publishContainer = async (containerId: string): Promise<string> => {
  const { instagramUserId } = resolveInstagramEnv();
  const published = await graphPost(`${instagramUserId}/media_publish`, {
    creation_id: containerId,
  });
  return String(published.id);
};

// Two-step Content Publishing flow: create a media container, wait until
// Instagram finishes ingesting the image, then publish it.
export const publishInstagramImage = async (
  options: PublishImageOptions
): Promise<string> => {
  const containerId = await createContainer(
    {
      image_url: options.imageUrl,
      ...(options.story
        ? { media_type: "STORIES" }
        : options.caption
          ? { caption: options.caption }
          : {}),
    },
    options.story ? {} : buildEnrichmentParams(options, true)
  );

  await waitForContainer(containerId);
  return publishContainer(containerId);
};

// Reels also appear in the profile grid (share_to_feed), so they replace
// an image post on the days they run instead of adding to it.
export const publishInstagramReel = async (
  options: FeedEnrichment & { videoUrl: string; caption: string }
): Promise<string> => {
  const containerId = await createContainer(
    {
      media_type: "REELS",
      video_url: options.videoUrl,
      caption: options.caption,
      share_to_feed: "true",
    },
    buildEnrichmentParams(options, false)
  );

  await waitForContainer(containerId, { attempts: 60, delayMs: 5000 });
  return publishContainer(containerId);
};

// Carousel: one item container per slide, then a parent container with
// the caption. Each cinema is tagged on its own slide; collaborators (up to
// 3) go on the parent. Carousels take no location.
export const publishInstagramCarousel = async (options: {
  slides: { imageUrl: string; userTags?: string[] }[];
  caption: string;
  collaborators?: string[];
}): Promise<string> => {
  const childIds: string[] = [];
  for (const slide of options.slides) {
    const childId = await createContainer(
      { image_url: slide.imageUrl, is_carousel_item: "true" },
      buildEnrichmentParams({ userTags: slide.userTags }, true)
    );
    await waitForContainer(childId);
    childIds.push(childId);
  }

  const containerId = await createContainer(
    {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: options.caption,
    },
    buildEnrichmentParams({ collaborators: options.collaborators }, false)
  );

  await waitForContainer(containerId);
  return publishContainer(containerId);
};
