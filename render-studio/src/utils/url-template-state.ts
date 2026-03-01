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
  if (!isObjectRecord(cinema.city)) {
    return false;
  }

  return (
    typeof value.id === "number" &&
    typeof value.date === "string" &&
    typeof value.time === "string" &&
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

    return {
      movie: parsed.movie,
      screening: parsed.screening,
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
