import type { InstagramMediaResponse } from "./interfaces/instagram.interface";
import type {
  InstagramConnectionConfig,
  InstagramMediaItem,
} from "./types/instagram.types";

const INSTAGRAM_GRAPH_API_VERSION = "v25.0";
const INSTAGRAM_GRAPH_API_BASE_URL = `https://graph.instagram.com/${INSTAGRAM_GRAPH_API_VERSION}`;

const createInstagramMediaUrl = (
  instagramUserId: string,
  accessToken: string
) => {
  const url = new URL(
    `${INSTAGRAM_GRAPH_API_BASE_URL}/${instagramUserId}/media`
  );

  url.searchParams.set(
    "fields",
    "id,caption,media_type,media_url,permalink,timestamp"
  );

  url.searchParams.set("access_token", accessToken);
  return url.toString();
};

export const fetchInstagramMedia = async (
  config: InstagramConnectionConfig
): Promise<InstagramMediaItem[]> => {
  const requestUrl = createInstagramMediaUrl(
    config.instagramUserId,
    config.accessToken
  );

  const response = await fetch(requestUrl);
  const payload = (await response.json()) as InstagramMediaResponse;

  if (!response.ok || payload.error) {
    const errorMessage =
      payload.error?.message ?? "Unexpected Instagram API error.";
    throw new Error(`Instagram connection failed: ${errorMessage}`);
  }

  if (!payload.data) {
    return [];
  }

  return payload.data;
};
