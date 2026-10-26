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

// Understated, arthouse-leaning beds that suit klaps' calm cards: a clear
// but soft pulse to change cards on, and a real ending (a final chord or
// hit about 3 s before the end, then a natural decay) so the end card can
// land on it instead of the music being cut off. Long enough for a hook
// and four cards before the ending.
const MUSIC_STYLE =
  "instrumental only, no vocals, tasteful and understated, steady clear pulse around 100 bpm with soft drums or percussion so the beat is audible, 20 seconds long, ends with one clear final chord and hit at 17 seconds followed by a natural decay to silence, no fade out";

export const MUSIC_PROMPTS: Record<Mood, [string, string]> = {
  classic: [
    `vintage jazz trio, brushed drums, upright bass, warm piano, 1950s cinema, ${MUSIC_STYLE}`,
    `silent film era piano with light swing percussion, elegant and nostalgic, ${MUSIC_STYLE}`,
  ],
  noir: [
    `film noir jazz, muted trumpet, brushed snare, walking bass, late night, ${MUSIC_STYLE}`,
    `moody neo-noir, soft electric piano, low bass pulse, rim clicks, ${MUSIC_STYLE}`,
  ],
  horror: [
    `dark ambient tension, low piano notes, soft heartbeat kick, eerie but restrained, ${MUSIC_STYLE}`,
    `unsettling minimal strings, ticking percussion, quiet dread, ${MUSIC_STYLE}`,
  ],
  scifi: [
    `minimal analog synth pulse, warm arpeggio, soft electronic drums, retro future, ${MUSIC_STYLE}`,
    `ambient electronica, glassy synths, gentle steady beat, sense of space, ${MUSIC_STYLE}`,
  ],
  romance: [
    `warm solo piano with soft strings and light percussion, tender, ${MUSIC_STYLE}`,
    `French cinema waltz, accordion and nylon guitar, soft brushes, ${MUSIC_STYLE}`,
  ],
  comedy: [
    `light jazz swing, playful upright bass, brushed drums, clarinet, ${MUSIC_STYLE}`,
    `bouncy pizzicato strings, glockenspiel, soft claps, charming, ${MUSIC_STYLE}`,
  ],
  epic: [
    `cinematic string ostinato with soft taiko pulse, noble and restrained, ${MUSIC_STYLE}`,
    `wide western guitar, slow galloping rhythm, open landscape, ${MUSIC_STYLE}`,
  ],
  drama: [
    `felt piano and cello, minimal and intimate, soft pulse, ${MUSIC_STYLE}`,
    `European art cinema, string quartet and ambient guitar, gentle steady rhythm, ${MUSIC_STYLE}`,
  ],
};

export const MUSIC_LENGTH_MS = 20000;

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
