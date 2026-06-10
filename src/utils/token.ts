// Shared mechanics for refreshable Meta tokens (Instagram, Threads).
// In containers the live token outlives any single deploy by living in a
// file on a volume; the env var only seeds the very first run. Locally
// (no *_TOKEN_FILE set) the refreshed value is written back into .env.
const ENV_FILE_URL = new URL("../../.env", import.meta.url);

export const readTokenFile = (fileEnvVar: string): string | undefined => {
  const tokenFile = process.env[fileEnvVar];
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

export const persistToken = async (
  token: string,
  envVar: string,
  fileEnvVar: string
): Promise<void> => {
  process.env[envVar] = token;

  try {
    const tokenFile = process.env[fileEnvVar];
    if (tokenFile) {
      await Bun.write(tokenFile, token);
      return;
    }

    const envFile = Bun.file(ENV_FILE_URL);
    if (await envFile.exists()) {
      const text = await envFile.text();
      await Bun.write(
        ENV_FILE_URL,
        text.replace(
          new RegExp(`^${envVar}=.*$`, "m"),
          `${envVar}=${token}`
        )
      );
    }
  } catch {
    console.warn(`Refreshed ${envVar} could not be persisted`);
  }
};
