import { FACEBOOK_API_VERSION, FACEBOOK_GRAPH_URL } from "./constants";
import { resolveFacebookEnv } from "./utils/environment";

type GraphError = { error?: { message?: string; code?: number } };

export const isFacebookConfigured = (): boolean =>
  Boolean(
    process.env.FACEBOOK_PAGE_ID?.trim() &&
      process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim()
  );

// Publishing a photo to a Facebook Page is a single call - no container /
// publish two-step like Instagram. A long-lived Page token does not expire.
export const publishFacebookPhoto = async (options: {
  imageUrl: string;
  caption?: string;
}): Promise<string> => {
  const { pageId, pageAccessToken } = resolveFacebookEnv();

  const response = await fetch(
    `${FACEBOOK_GRAPH_URL}/${FACEBOOK_API_VERSION}/${pageId}/photos`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        url: options.imageUrl,
        ...(options.caption ? { caption: options.caption } : {}),
        access_token: pageAccessToken,
      }),
    }
  );

  const data = (await response.json()) as {
    id?: string;
    post_id?: string;
  } & GraphError;

  if (!response.ok) {
    throw new Error(
      `Facebook API error (photos): ${data.error?.message ?? response.statusText}`
    );
  }

  return String(data.post_id ?? data.id);
};
