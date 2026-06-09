import { INSTAGRAM_API_VERSION, INSTAGRAM_GRAPH_URL } from "./constants";
import { resolveInstagramEnv } from "./utils/environment";
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

export type PublishImageOptions = {
  imageUrl: string;
  caption?: string;
  story?: boolean;
};

// Two-step Content Publishing flow: create a media container, wait until
// Instagram finishes ingesting the image, then publish it.
export const publishInstagramImage = async (
  options: PublishImageOptions
): Promise<string> => {
  const { instagramUserId } = resolveInstagramEnv();

  const container = await graphPost(`${instagramUserId}/media`, {
    image_url: options.imageUrl,
    ...(options.story
      ? { media_type: "STORIES" }
      : options.caption
        ? { caption: options.caption }
        : {}),
  });

  const containerId = String(container.id);

  for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt += 1) {
    const status = await getContainerStatus(containerId);
    if (status === "FINISHED") break;
    if (status === "ERROR") {
      throw new Error("Instagram could not process the uploaded image");
    }
    await sleep(CONTAINER_POLL_DELAY_MS);
  }

  const published = await graphPost(`${instagramUserId}/media_publish`, {
    creation_id: containerId,
  });

  return String(published.id);
};
