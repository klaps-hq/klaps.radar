export type CandidateApiEnv = {
  apiUrl: string;
  internalApiKey: string;
};

export type InstagramEnv = {
  accessToken: string;
  instagramUserId: string;
};

const getMissingVars = (
  vars: Record<string, string | undefined>
): string[] => {
  return Object.entries(vars)
    .filter(([, value]) => !value)
    .map(([key]) => key);
};

export const resolveCandidateApiEnv = (): CandidateApiEnv => {
  const apiUrl = process.env.API_URL;
  const internalApiKey = process.env.INTERNAL_API_KEY;
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

export const resolveInstagramEnv = (): InstagramEnv => {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const instagramUserId = process.env.INSTAGRAM_USER_ID;
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
