export type CandidateApiEnv = {
  apiUrl: string;
  internalApiKey: string;
};

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

export const resolveCandidateApiEnv = (): CandidateApiEnv => {
  const apiUrl = normalizeEnvValue(process.env.API_URL);
  const internalApiKey = normalizeEnvValue(process.env.INTERNAL_API_KEY);
  const missing = getMissingVars({
    API_URL: apiUrl,
    INTERNAL_API_KEY: internalApiKey,
  });

  if (missing.length > 0) {
    throw new Error(`Set required environment variables: ${missing.join(", ")}.`);
  }

  return {
    apiUrl: apiUrl as string,
    internalApiKey: internalApiKey as string,
  };
};

// In containers the refreshed token outlives any single deploy by living in
// a file on a volume; the env var only seeds the very first run.
const readTokenFromFile = (): string | undefined => {
  const tokenFile = process.env.INSTAGRAM_TOKEN_FILE;
  if (!tokenFile) {
    return undefined;
  }

  try {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const token = readFileSync(tokenFile, "utf8").trim();
    return token || undefined;
  } catch {
    return undefined;
  }
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
    readTokenFromFile() ?? process.env.INSTAGRAM_ACCESS_TOKEN
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
