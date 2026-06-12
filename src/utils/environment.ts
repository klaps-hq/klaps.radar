import { readTokenFile } from "./token";

export type InstagramEnv = {
  accessToken: string;
  instagramUserId: string;
};

const normalizeEnvValue = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const unquoted = trimmed.replace(/^['"]|['"]$/g, "");
  return unquoted.trim();
};

const normalizeAccessToken = (value: string | undefined): string | undefined => {
  const normalized = normalizeEnvValue(value);
  if (!normalized) {
    return undefined;
  }

  // Accept either raw token or accidentally prefixed "Bearer <token>".
  return normalized.replace(/^Bearer\s+/i, "").trim();
};

const getMissingVars = (
  vars: Record<string, string | undefined>
): string[] => {
  return Object.entries(vars)
    .filter(([, value]) => !value)
    .map(([key]) => key);
};

export type FacebookEnv = {
  pageId: string;
  pageAccessToken: string;
};

export const resolveFacebookEnv = (): FacebookEnv => {
  const pageId = normalizeEnvValue(process.env.FACEBOOK_PAGE_ID);
  const pageAccessToken = normalizeAccessToken(
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  );
  const missing = getMissingVars({
    FACEBOOK_PAGE_ID: pageId,
    FACEBOOK_PAGE_ACCESS_TOKEN: pageAccessToken,
  });

  if (missing.length > 0) {
    throw new Error(`Set required environment variables: ${missing.join(", ")}.`);
  }

  return {
    pageId: pageId as string,
    pageAccessToken: pageAccessToken as string,
  };
};

export const resolveInstagramEnv = (): InstagramEnv => {
  const accessToken = normalizeAccessToken(
    readTokenFile("INSTAGRAM_TOKEN_FILE") ?? process.env.INSTAGRAM_ACCESS_TOKEN
  );
  const instagramUserId = normalizeEnvValue(process.env.INSTAGRAM_USER_ID);
  const missing = getMissingVars({
    INSTAGRAM_ACCESS_TOKEN: accessToken,
    INSTAGRAM_USER_ID: instagramUserId,
  });

  if (missing.length > 0) {
    throw new Error(`Set required environment variables: ${missing.join(", ")}.`);
  }

  return {
    accessToken: accessToken as string,
    instagramUserId: instagramUserId as string,
  };
};

export type ThreadsEnv = {
  accessToken: string;
  threadsUserId: string;
};

export const resolveThreadsEnv = (): ThreadsEnv => {
  const accessToken = normalizeAccessToken(
    readTokenFile("THREADS_TOKEN_FILE") ?? process.env.THREADS_ACCESS_TOKEN
  );
  const threadsUserId = normalizeEnvValue(process.env.THREADS_USER_ID);
  const missing = getMissingVars({
    THREADS_ACCESS_TOKEN: accessToken,
    THREADS_USER_ID: threadsUserId,
  });

  if (missing.length > 0) {
    throw new Error(`Set required environment variables: ${missing.join(", ")}.`);
  }

  return {
    accessToken: accessToken as string,
    threadsUserId: threadsUserId as string,
  };
};
