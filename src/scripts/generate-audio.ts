import { mkdir } from "node:fs/promises";
import {
  MUSIC_LENGTH_MS,
  MUSIC_PROMPTS,
  musicFile,
  SFX_PROMPTS,
  sfxFile,
  type Mood,
  type Sfx,
} from "../audio/library";

// One-off generator for the reel soundtrack library (assets/audio). Run
// locally with ELEVENLABS_API_KEY in .env; the output is committed, so the
// container never calls ElevenLabs. Existing files are kept unless --force.
//   bun --env-file .env src/scripts/generate-audio.ts [--force] [--only noir]
const API = "https://api.elevenlabs.io/v1";
const ROOT = new URL("../../assets/audio/", import.meta.url);
const force = process.argv.includes("--force");
const only = (() => {
  const i = process.argv.indexOf("--only");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY is not set");

const generate = async (
  endpoint: string,
  body: Record<string, unknown>,
  file: string
) => {
  const target = new URL(file, ROOT);
  if (!force && (await Bun.file(target).exists())) {
    console.log(`skip ${file}`);
    return;
  }
  const response = await fetch(`${API}/${endpoint}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${file}: ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
  await Bun.write(target, await response.arrayBuffer());
  console.log(`wrote ${file}`);
};

await mkdir(new URL("music/", ROOT), { recursive: true });
await mkdir(new URL("sfx/", ROOT), { recursive: true });

for (const [mood, prompts] of Object.entries(MUSIC_PROMPTS) as [Mood, [string, string]][]) {
  if (only && only !== mood) continue;
  for (const variant of [0, 1] as const) {
    await generate(
      "music",
      { prompt: prompts[variant], music_length_ms: MUSIC_LENGTH_MS },
      musicFile(mood, variant)
    );
  }
}

for (const [sfx, { text, seconds }] of Object.entries(SFX_PROMPTS) as [Sfx, { text: string; seconds: number }][]) {
  if (only && only !== sfx) continue;
  await generate(
    "sound-generation",
    { text, duration_seconds: seconds, prompt_influence: 0.6 },
    sfxFile(sfx)
  );
}
