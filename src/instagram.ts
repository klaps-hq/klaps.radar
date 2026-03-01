import type { InstagramCandidateApiResponse } from "./interfaces/instagram.interface";
import type {
  FetchInstagramCandidateConfig,
  InstagramCandidateResponse,
} from "./types/instagram.types";

const parseJsonSafely = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const createInstagramCandidateUrl = (apiUrl: string, date?: string): string => {
  const normalizedApiUrl = apiUrl.endsWith("/") ? apiUrl.slice(0, -1) : apiUrl;
  const url = new URL(`${normalizedApiUrl}/instagram/candidate`);
  const dateValue = date?.trim();
  if (dateValue) {
    url.searchParams.set("date", dateValue);
  }
  return url.toString();
};

const resolveInternalApiErrorMessage = (
  payload: InstagramCandidateApiResponse | null,
  statusCode: number
): string => {
  if (!payload) {
    return `Internal API request failed with status ${statusCode}.`;
  }
  if (typeof payload.error === "string" && payload.error.length > 0) {
    return payload.error;
  }
  const apiError =
    typeof payload.error === "string" ? undefined : payload.error;
  if (apiError?.message) {
    return apiError.message;
  }
  if (payload.message) {
    return payload.message;
  }
  return `Internal API request failed with status ${statusCode}.`;
};

const POLISH_MONTHS: Record<number, string> = {
  1: "stycznia",
  2: "lutego",
  3: "marca",
  4: "kwietnia",
  5: "maja",
  6: "czerwca",
  7: "lipca",
  8: "sierpnia",
  9: "września",
  10: "października",
  11: "listopada",
  12: "grudnia",
};

const POLISH_SHORT_WEEKDAYS: Record<number, string> = {
  0: "niedz.",
  1: "pon.",
  2: "wt.",
  3: "śr.",
  4: "czw.",
  5: "pt.",
  6: "sob.",
};

const formatShortPolishDate = (dateString: string): string => {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDate();
  const month = POLISH_MONTHS[date.getMonth() + 1] ?? "";
  const weekday = POLISH_SHORT_WEEKDAYS[date.getDay()] ?? "";
  return `${weekday} ${day} ${month}`;
};

const getAudioVersionLabel = (
  screening: InstagramCandidateResponse["screening"]
): string => {
  if (!screening) {
    return "";
  }
  if (screening.isSubtitled) {
    return "napisy";
  }
  if (screening.isDubbing) {
    return "dubbing";
  }
  return "wersja oryginalna";
};

const getAudioSentenceFragment = (
  screening: InstagramCandidateResponse["screening"]
): string => {
  if (!screening) {
    return "";
  }
  if (screening.isSubtitled) {
    return ", z napisami";
  }
  if (screening.isDubbing) {
    return ", z dubbingiem";
  }
  return "";
};

const slugToHashtag = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0142/g, "l")
    .replace(/[^a-z0-9]/g, "");

const CONTEXT_TEMPLATES = [
  (genre: string, city: string, audio: string) =>
    `${genre} na wielkim ekranie w ${city}${audio}.`,
  (genre: string, city: string, audio: string) =>
    `Klasyka gatunku wraca do kin. ${genre} do zobaczenia w ${city}${audio}.`,
  (genre: string, city: string, audio: string) =>
    `${genre} w kinie, tak jak powinno się go oglądać. ${city}${audio}.`,
  (genre: string, city: string, audio: string) =>
    `Seans specjalny w ${city}. ${genre}${audio} -- warto się wybrać.`,
  (genre: string, city: string, audio: string) =>
    `Rzadka okazja, żeby zobaczyć ten ${genre.toLowerCase()} na dużym ekranie. ${city}${audio}.`,
  (genre: string, city: string, audio: string) =>
    `${genre} w ${city}${audio}. Kino, nie streaming.`,
  (genre: string, city: string, audio: string) =>
    `Wieczór filmowy w ${city}? ${genre}${audio} to dobry wybór.`,
  (genre: string, city: string, audio: string) =>
    `${genre} wraca na duży ekran. Sprawdź seans w ${city}${audio}.`,
  (genre: string, city: string, audio: string) =>
    `Jeśli ${genre.toLowerCase()} robi największe wrażenie, to tylko w kinie. W${city}${audio}.`,
  (genre: string, city: string, audio: string) =>
    `Na ten ${genre.toLowerCase()} warto wyjść z domu. W${city}${audio}.`,
  (genre: string, city: string, audio: string) =>
    `${genre} i sala kinowa to idealne połączenie. Widzimy się w ${city}${audio}.`,
];

const pickRandom = <T>(items: T[]): T =>
  items[Math.floor(Math.random() * items.length)] as T;

const buildContextSentence = (
  candidate: InstagramCandidateResponse
): string => {
  if (!candidate.movie || !candidate.screening) {
    return "";
  }

  const genreLabel = candidate.movie.genres[0]?.name ?? "Film";
  const cityDeclinated =
    candidate.screening.cinema.city.nameDeclinated ??
    candidate.screening.cinema.city.name;
  const audio = getAudioSentenceFragment(candidate.screening);

  const template = pickRandom(CONTEXT_TEMPLATES);
  return template(genreLabel, cityDeclinated, audio);
};

const buildHashtags = (candidate: InstagramCandidateResponse): string => {
  const tags = new Set<string>();
  tags.add("klasykakina");
  tags.add("kinomaniak");
  tags.add("filmklasyczny");
  tags.add("seansspecjalny");

  if (candidate.movie) {
    const titleTag = slugToHashtag(candidate.movie.title);
    if (titleTag.length > 2) {
      tags.add(titleTag);
    }
    if (candidate.movie.titleOriginal) {
      const originalTag = slugToHashtag(candidate.movie.titleOriginal);
      if (originalTag.length > 2 && originalTag !== titleTag) {
        tags.add(originalTag);
      }
    }
    for (const genre of candidate.movie.genres) {
      const genreTag = slugToHashtag(genre.name);
      if (genreTag.length > 2) {
        tags.add(genreTag);
      }
    }
    if (candidate.movie.productionYear < 1980) {
      tags.add("zlotaerakina");
    }
  }

  if (candidate.screening) {
    const cityTag = slugToHashtag(candidate.screening.cinema.city.name);
    if (cityTag.length > 2) {
      tags.add(cityTag);
    }
  }

  tags.add("kinopolskie");

  return Array.from(tags)
    .map((tag) => `#${tag}`)
    .join(" ");
};

const HASHTAG_SEPARATOR = "\n.\n.\n.\n.\n.\n";

export const buildStoryInfoFromCandidate = (
  candidate: InstagramCandidateResponse
): { title: string; facts: string[] } => {
  if (!candidate.movie || !candidate.screening) {
    throw new Error(
      "Cannot build story info: candidate payload is incomplete."
    );
  }

  const { movie, screening } = candidate;
  const audioLabel = getAudioVersionLabel(screening);

  return {
    title: `${movie.title} (${movie.productionYear})`,
    facts: [
      `${formatShortPolishDate(screening.date)}, godz. ${screening.time}`,
      screening.cinema.name,
      `${screening.cinema.street}, ${screening.cinema.city.name}`,
      audioLabel.length > 0 ? `Wersja: ${audioLabel}` : "",
    ],
  };
};

export const buildCaptionFromCandidate = (
  candidate: InstagramCandidateResponse
): string => {
  if (!candidate.movie || !candidate.screening) {
    throw new Error(
      "Cannot build Instagram caption: candidate payload is incomplete."
    );
  }

  const { movie, screening } = candidate;
  const shortDate = formatShortPolishDate(screening.date);

  const sections: string[] = [];

  const titleLine = movie.titleOriginal
    ? `${movie.title} (${movie.productionYear})`
    : `${movie.title} (${movie.productionYear})`;
  sections.push(titleLine);

  sections.push("");
  sections.push(movie.description.trim());

  sections.push("");
  sections.push(buildContextSentence(candidate));

  sections.push("");
  sections.push(`${screening.cinema.name}, ${screening.cinema.street}`);
  sections.push(`${shortDate}, godz. ${screening.time}`);

  sections.push("");
  sections.push("Więcej o filmie: klaps.space");

  const hashtags = buildHashtags(candidate);
  if (hashtags.length > 0) {
    sections.push(HASHTAG_SEPARATOR);
    sections.push(hashtags);
  }

  return sections.join("\n");
};

export const fetchInstagramCandidate = async (
  config: FetchInstagramCandidateConfig
): Promise<InstagramCandidateResponse> => {
  const requestUrl = createInstagramCandidateUrl(config.apiUrl, config.date);
  const response = await fetch(requestUrl, {
    method: "GET",
    headers: {
      "x-internal-api-key": config.internalApiKey,
    },
  });
  const payload = (await parseJsonSafely<InstagramCandidateApiResponse>(
    response
  )) as InstagramCandidateApiResponse | null;

  if (!response.ok || payload?.error) {
    const errorMessage = resolveInternalApiErrorMessage(
      payload,
      response.status
    );
    throw new Error(`Instagram candidate fetch failed: ${errorMessage}`);
  }

  if (!payload || typeof payload.publish !== "boolean") {
    throw new Error(
      "Instagram candidate fetch failed: invalid payload format."
    );
  }

  return payload;
};
