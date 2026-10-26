// Reel soundtrack library. The files are generated once with ElevenLabs
// (src/scripts/generate-audio.ts) and committed under assets/audio, so
// publishing never calls ElevenLabs and production needs no key. Instagram's
// music library is not available to API-published reels, so the audio has
// to be part of the video file.

export type Mood =
  | "classic"
  | "noir"
  | "horror"
  | "scifi"
  | "romance"
  | "comedy"
  | "epic"
  | "drama";

const MUSIC_STYLE =
  "instrumental only, no vocals, cinematic trailer bed, clear 4/4 pulse around 100 bpm, mixes well under sound effects";

export const MUSIC_PROMPTS: Record<Mood, [string, string]> = {
  classic: [
    `silent film era ragtime piano, warm vintage recording, playful but elegant, ${MUSIC_STYLE}`,
    `1940s Hollywood studio orchestra, lush strings and woodwinds, nostalgic golden age, ${MUSIC_STYLE}`,
  ],
  noir: [
    `film noir jazz, muted trumpet, brushed drums, walking upright bass, smoky and tense, ${MUSIC_STYLE}`,
    `neo-noir thriller, pulsing low synth bass, ticking percussion, suspenseful, ${MUSIC_STYLE}`,
  ],
  horror: [
    `horror trailer, eerie music box melody, dissonant strings, low drones, unsettling, ${MUSIC_STYLE}`,
    `psychological horror, scraping strings, heartbeat kick drum, creeping dread, ${MUSIC_STYLE}`,
  ],
  scifi: [
    `retro 80s science fiction synthwave, analog arpeggios, wide pads, wonder, ${MUSIC_STYLE}`,
    `space odyssey ambient, shimmering synth textures, slow building pulse, vast and awe-inspiring, ${MUSIC_STYLE}`,
  ],
  romance: [
    `romantic jazz waltz, solo piano and soft strings, bittersweet Los Angeles evening, ${MUSIC_STYLE}`,
    `French romantic cinema, accordion and nylon guitar, tender and wistful, ${MUSIC_STYLE}`,
  ],
  comedy: [
    `quirky comedy, pizzicato strings, glockenspiel, bouncy bassoon, light and witty, ${MUSIC_STYLE}`,
    `upbeat indie comedy, ukulele, hand claps, whistling-like synth lead, cheerful, ${MUSIC_STYLE}`,
  ],
  epic: [
    `epic adventure trailer, driving orchestral ostinato, big taiko drums, heroic brass, ${MUSIC_STYLE}`,
    `western adventure, twangy electric guitar, galloping rhythm, wide open spaces, ${MUSIC_STYLE}`,
  ],
  drama: [
    `arthouse drama, felt piano, cello, minimal and intimate, emotional build, ${MUSIC_STYLE}`,
    `European art cinema, ambient guitar and string quartet, contemplative, slow pulse, ${MUSIC_STYLE}`,
  ],
};

export const MUSIC_LENGTH_MS = 14000;

export type Sfx =
  | "projector"
  | "whoosh1"
  | "whoosh2"
  | "impact"
  | "click"
  | "clap"
  | "tick";

export const SFX_PROMPTS: Record<Sfx, { text: string; seconds: number }> = {
  projector: {
    text: "old 35mm film projector starting up, mechanical whirr and rhythmic clicking, warm",
    seconds: 1.6,
  },
  whoosh1: {
    text: "short cinematic whoosh transition, airy swoosh, clean, no reverb tail",
    seconds: 0.8,
  },
  whoosh2: {
    text: "fast film reel swipe transition, quick whoosh with subtle film flutter",
    seconds: 0.8,
  },
  impact: {
    text: "deep cinematic trailer hit, boom with short sub bass tail, punchy",
    seconds: 1.5,
  },
  clap: {
    text: "single wooden film clapperboard clap, sharp crisp snap, close microphone, no room reverb",
    seconds: 0.6,
  },
  tick: {
    text: "single soft mechanical tick, like a film counter or typewriter key, short and dry",
    seconds: 0.5,
  },
  click: {
    text: "film projector stopping, last frames flicking and a mechanical click",
    seconds: 1.2,
  },
};

export const musicFile = (mood: Mood, variant: 0 | 1): string =>
  `music/${mood}-${variant + 1}.mp3`;
export const sfxFile = (sfx: Sfx): string => `sfx/${sfx}.mp3`;

// Genre ids from api.klaps.space (/genres). First match in priority order
// wins, since mixed genres usually read as the stronger mood.
const GENRE_MOODS: [Mood, number[]][] = [
  ["horror", [5]],
  ["noir", [9, 10, 13]],
  ["scifi", [12]],
  ["romance", [14, 15]],
  ["comedy", [3, 7, 16]],
  ["epic", [1, 2, 6, 8, 17, 35]],
];

// Pre-1960 films get the vintage score whatever the genre.
const CLASSIC_BEFORE_YEAR = 1960;

export const pickMood = (genreIds: number[], productionYear: number): Mood => {
  if (productionYear < CLASSIC_BEFORE_YEAR) return "classic";
  for (const [mood, ids] of GENRE_MOODS) {
    if (genreIds.some((id) => ids.includes(id))) return mood;
  }
  return "drama";
};
