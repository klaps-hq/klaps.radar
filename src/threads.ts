import { setTimeout as sleep } from "node:timers/promises";
import { THREADS_API_VERSION, THREADS_GRAPH_URL } from "./constants";
import { resolveThreadsEnv } from "./utils/environment";
import { persistToken } from "./utils/token";

const CONTAINER_POLL_ATTEMPTS = 10;
const CONTAINER_POLL_DELAY_MS = 1500;

type GraphError = { error?: { message?: string; code?: number } };

export const isThreadsConfigured = (): boolean =>
  Boolean(
    process.env.THREADS_USER_ID?.trim() &&
      (process.env.THREADS_ACCESS_TOKEN?.trim() ||
        process.env.THREADS_TOKEN_FILE?.trim())
  );

const graphPost = async (
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> => {
  const { accessToken } = resolveThreadsEnv();
  const response = await fetch(
    `${THREADS_GRAPH_URL}/${THREADS_API_VERSION}/${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, access_token: accessToken }),
    }
  );

  const data = (await response.json()) as Record<string, unknown> & GraphError;

  if (!response.ok) {
    throw new Error(
      `Threads API error (${path}): ${data.error?.message ?? response.statusText}`
    );
  }

  return data;
};

const getContainerStatus = async (containerId: string): Promise<string> => {
  const { accessToken } = resolveThreadsEnv();
  const url = new URL(
    `${THREADS_GRAPH_URL}/${THREADS_API_VERSION}/${containerId}`
  );
  url.searchParams.set("fields", "status");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const data = (await response.json()) as { status?: string } & GraphError;

  if (!response.ok) {
    throw new Error(
      `Threads API error (container status): ${data.error?.message ?? response.statusText}`
    );
  }

  return data.status ?? "UNKNOWN";
};

// Long-lived Threads tokens expire after ~60 days but can be refreshed any
// time once they are 24h old - same model as Instagram.
export const refreshThreadsToken = async (): Promise<void> => {
  const { accessToken } = resolveThreadsEnv();
  const url = new URL(`${THREADS_GRAPH_URL}/refresh_access_token`);
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  } & GraphError;

  if (!response.ok || !data.access_token) {
    console.warn(
      `Threads token refresh skipped: ${data.error?.message ?? response.statusText}`
    );
    return;
  }

  await persistToken(
    data.access_token,
    "THREADS_ACCESS_TOKEN",
    "THREADS_TOKEN_FILE"
  );

  const validDays = Math.round((data.expires_in ?? 0) / 86400);
  console.log(`Threads token refreshed (valid ~${validDays} days)`);
};

// Same two-step flow as Instagram: create a media container, wait until it
// is processed, then publish it.
export const publishThreadsImage = async (options: {
  imageUrl: string;
  text?: string;
}): Promise<string> => {
  const { threadsUserId } = resolveThreadsEnv();

  const container = await graphPost(`${threadsUserId}/threads`, {
    media_type: "IMAGE",
    image_url: options.imageUrl,
    ...(options.text ? { text: options.text } : {}),
  });

  const containerId = String(container.id);

  for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt += 1) {
    const status = await getContainerStatus(containerId);
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Threads could not process the media (${status})`);
    }
    await sleep(CONTAINER_POLL_DELAY_MS);
  }

  const published = await graphPost(`${threadsUserId}/threads_publish`, {
    creation_id: containerId,
  });

  return String(published.id);
};
