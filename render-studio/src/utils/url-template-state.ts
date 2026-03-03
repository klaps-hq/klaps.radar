import { decodeBase64UrlToUtf8, isObjectRecord } from ".";
import type { IMovie } from "../types/IMovies";
import type { IScreening, IScreeningDetail } from "../types/IScreenings";

const isMoviePayload = (value: unknown): value is IMovie => {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "number" &&
    typeof value.title === "string" &&
    typeof value.productionYear === "number"
  );
};

const isScreeningPayload = (value: unknown): value is IScreening => {
  if (!isObjectRecord(value) || !isObjectRecord(value.cinema)) {
    return false;
  }

  const cinema = value.cinema;
  if (!isObjectRecord(cinema.city) || typeof cinema.city.name !== "string") {
    return false;
  }

  return (
    typeof value.id === "number" &&
    typeof value.date === "string" &&
    typeof cinema.name === "string"
  );
};

export const parseTemplatePayload = (
  rawData: string | null
): IScreeningDetail | null => {
  if (!rawData) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64UrlToUtf8(rawData));

    if (!isObjectRecord(parsed)) {
      return null;
    }

    if (!isMoviePayload(parsed.movie) || !isScreeningPayload(parsed.screening)) {
      return null;
    }

    const movie = parsed.movie as unknown as Record<string, unknown>;
    const normalizedMovie: IMovie = {
      ...movie,
      genres: Array.isArray(movie.genres) ? movie.genres : [],
    } as IMovie;

    const screening = parsed.screening as Partial<IScreening> & {
      date: string;
      cinema: { name: string; city: { name: string }; street?: string | null };
    };
    const normalizedScreening: IScreening = {
      ...screening,
      id: screening.id ?? 0,
      date: screening.date,
      time:
        screening.time ??
        (() => {
          const dateStr = screening.date;
          if (typeof dateStr === "string" && dateStr.includes("T")) {
            const timePart = dateStr.split("T")[1];
            return timePart?.slice(0, 5) ?? "–";
          }
          return "–";
        })(),
      dateTime: screening.dateTime ?? screening.date,
      ticketUrl: screening.ticketUrl ?? null,
      isDubbing: screening.isDubbing ?? false,
      isSubtitled: screening.isSubtitled ?? false,
      cinema: screening.cinema as IScreening["cinema"],
      movie: screening.movie as IScreening["movie"],
    };

    return {
      movie: normalizedMovie,
      screening: normalizedScreening,
    };
  } catch {
    return null;
  }
};

export const readTemplateStateFromSearchParams = (search: string) => {
  const searchParams = new URLSearchParams(search);

  const rawPayload = searchParams.get("data");
  const templateKey = searchParams.get("template");

  const captureMode =
    searchParams.get("capture") === "1" ||
    searchParams.get("capture") === "true";

  if (!templateKey) {
    return null;
  }

  return {
    templateKey,
    captureMode,

    rawPayload,
  };
};
