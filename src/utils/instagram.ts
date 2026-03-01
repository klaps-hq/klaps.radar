import type { InstagramCandidateApiResponse } from "../interfaces/instagram.interface";
import type {
  FetchInstagramCandidateConfig,
  InstagramCandidateResponse,
} from "../types/instagram.types";

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

type PublishInstagramImagePostConfig = {
  instagramUserId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

type PublishInstagramImagePostResult = {
  creationId: string;
  mediaId: string;
};

const GRAPH_API_VERSION = "v25.0";
const GRAPH_API_BASE_URL = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
const DEFAULT_PUBLISH_TIMEOUT_MS = 120000;
const DEFAULT_POLL_INTERVAL_MS = 2000;

type GraphApiErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

const buildGraphApiUrl = (path: string): string =>
  `${GRAPH_API_BASE_URL}/${path.replace(/^\//, "")}`;

const resolveGraphApiErrorMessage = (
  payload: GraphApiErrorResponse | null,
  statusCode: number
): string => {
  if (!payload?.error) {
    return `Instagram Graph API request failed with status ${statusCode}.`;
  }

  const pieces = [
    payload.error.message,
    payload.error.type ? `type=${payload.error.type}` : "",
    payload.error.code ? `code=${payload.error.code}` : "",
    payload.error.error_subcode ? `subcode=${payload.error.error_subcode}` : "",
  ].filter(
    (piece): piece is string => typeof piece === "string" && piece.length > 0
  );

  if (pieces.length === 0) {
    return `Instagram Graph API request failed with status ${statusCode}.`;
  }

  return pieces.join(" | ");
};

const postGraphApiForm = async <TResponse>(
  path: string,
  body: Record<string, string>
): Promise<TResponse> => {
  const response = await fetch(buildGraphApiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

  const payload = (await parseJsonSafely<TResponse & GraphApiErrorResponse>(
    response
  )) as (TResponse & GraphApiErrorResponse) | null;

  if (!response.ok || payload?.error) {
    const errorMessage = resolveGraphApiErrorMessage(payload, response.status);
    throw new Error(errorMessage);
  }

  if (!payload) {
    throw new Error("Instagram Graph API request failed: empty response.");
  }

  return payload;
};

const getGraphApiJson = async <TResponse>(path: string): Promise<TResponse> => {
  const response = await fetch(buildGraphApiUrl(path), {
    method: "GET",
  });

  const payload = (await parseJsonSafely<TResponse & GraphApiErrorResponse>(
    response
  )) as (TResponse & GraphApiErrorResponse) | null;

  if (!response.ok || payload?.error) {
    const errorMessage = resolveGraphApiErrorMessage(payload, response.status);
    throw new Error(errorMessage);
  }

  if (!payload) {
    throw new Error("Instagram Graph API request failed: empty response.");
  }

  return payload;
};

const waitForContainerReady = async (
  creationId: string,
  accessToken: string,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<void> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const statusPayload = await getGraphApiJson<{
      status_code?: "IN_PROGRESS" | "FINISHED" | "ERROR" | string;
      status?: "IN_PROGRESS" | "FINISHED" | "ERROR" | string;
    }>(
      `${creationId}?fields=status_code,status&access_token=${encodeURIComponent(
        accessToken
      )}`
    );

    const status = statusPayload.status_code ?? statusPayload.status;
    if (status === "FINISHED") {
      return;
    }

    if (status === "ERROR") {
      throw new Error(
        `Instagram media container ${creationId} finished with ERROR status.`
      );
    }

    await Bun.sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for Instagram media container ${creationId} to be ready.`
  );
};

export const publishInstagramImagePost = async (
  config: PublishInstagramImagePostConfig
): Promise<PublishInstagramImagePostResult> => {
  const timeoutMs = config.timeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS;
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const createPayload = await postGraphApiForm<{ id?: string }>(
    `${config.instagramUserId}/media`,
    {
      image_url: config.imageUrl,
      caption: config.caption,
      access_token: config.accessToken.trim(),
    }
  );

  const creationId = createPayload.id;
  if (!creationId) {
    throw new Error("Instagram media container creation failed: missing id.");
  }

  await waitForContainerReady(
    creationId,
    config.accessToken,
    timeoutMs,
    pollIntervalMs
  );

  const publishPayload = await postGraphApiForm<{ id?: string }>(
    `${config.instagramUserId}/media_publish`,
    {
      creation_id: creationId,
      access_token: config.accessToken.trim(),
    }
  );

  const mediaId = publishPayload.id;
  if (!mediaId) {
    throw new Error("Instagram media publish failed: missing media id.");
  }

  return {
    creationId,
    mediaId,
  };
};
