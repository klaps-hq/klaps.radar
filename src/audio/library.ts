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

// Prompted like the beats behind short-form movie edits, not like trailer
// beds: the drums are in from the first bar and every kick is clear enough
// to cut on. Each track also has a real ending, a final stinger hit about
// 2.5 s before the end followed by its tail, so the reel's end card can
// land on it instead of the music being cut off mid-phrase.
const MUSIC_STYLE =
  "instrumental only, no vocals, short-form video edit beat, drums from the first bar, punchy kick and snare, steady tempo, loud modern mix, the track builds and then ends with one big final stinger hit at 12.5 seconds followed only by its reverb tail and silence, no fade out";

export const MUSIC_PROMPTS: Record<Mood, [string, string]> = {
  classic: [
    `jazz hip hop, dusty swing sample chop, upright bass, boom bap drums, vinyl crackle, 92 bpm, ${MUSIC_STYLE}`,
    `electro swing, brass stabs, four on the floor kick, groovy 1930s feel, 120 bpm, ${MUSIC_STYLE}`,
  ],
  noir: [
    `dark phonk, cowbell melody, distorted 808 bass, drift phonk drums, 130 bpm, ${MUSIC_STYLE}`,
    `noir trap, muted trumpet sample, heavy 808, crisp hi-hats, moody night city, 140 bpm, ${MUSIC_STYLE}`,
  ],
  horror: [
    `horror trap, eerie music box sample, distorted 808 slides, hard hitting drums, 140 bpm, ${MUSIC_STYLE}`,
    `dark drill beat, haunting choir sample, sliding 808, menacing, 142 bpm, ${MUSIC_STYLE}`,
  ],
  scifi: [
    `synthwave drive, punchy gated snare, pulsing bassline, neon arpeggio, 118 bpm, ${MUSIC_STYLE}`,
    `cyberpunk electronic beat, glitchy synths, heavy sidechained bass, 128 bpm, ${MUSIC_STYLE}`,
  ],
  romance: [
    `lo-fi romantic beat, warm piano chords, soft kick and snare, slowed vibe, 85 bpm, ${MUSIC_STYLE}`,
    `romantic r&b beat, dreamy electric piano, deep bass, finger snaps, 90 bpm, ${MUSIC_STYLE}`,
  ],
  comedy: [
    `bouncy funk beat, slap bass, playful clavinet, tight drums, 110 bpm, ${MUSIC_STYLE}`,
    `upbeat quirky pop beat, pizzicato hook, handclaps, bouncy bass, 115 bpm, ${MUSIC_STYLE}`,
  ],
  epic: [
    `epic orchestral trap, big string ostinato, heavy 808 drops, braams, 140 bpm, ${MUSIC_STYLE}`,
    `hard hitting cinematic hip hop, brass hits, taiko and trap drums, 95 bpm, ${MUSIC_STYLE}`,
  ],
  drama: [
    `emotional piano drill beat, melancholic piano, sliding 808, crisp hats, 140 bpm, ${MUSIC_STYLE}`,
    `cinematic emotional hip hop, cello sample, deep kick, slow powerful groove, 88 bpm, ${MUSIC_STYLE}`,
  ],
};

export const MUSIC_LENGTH_MS = 15000;

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
