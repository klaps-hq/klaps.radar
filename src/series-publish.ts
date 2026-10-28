import { API_URL, INTERNAL_API_KEY } from "./constants/env";
import { publishInstagramCarousel, refreshInstagramToken } from "./instagram";
import { uploadTemporaryMedia } from "./publish";
import { renderSeries } from "./render/series";
import {
  buildMonthStats,
  buildRetrospective,
  canBuildRetrospective,
  formatDayMonth,
  plural,
  POLISH_MONTHS,
  type MonthStats,
  type Retrospective,
} from "./series";
import type { Screening } from "./types/types";
import { addDays, todayInPoland } from "./utils/format";

// Publishing for the editorial series: "Klaps w liczbach" (monthly numbers)
// and director retrospectives. Data comes from /socials/series/* in the API,
// which also records what was published so neither series repeats itself.
type Movie = Screening["movie"];
export type SeriesKind = "stats" | "retrospective";

// A month with fewer classic screenings than this is not worth a post.
const MIN_MONTH_SCREENINGS = 50;
// Retrospectives look this far ahead and need this many films.
const RETROSPECTIVE_DAYS_AHEAD = 21;
const RETROSPECTIVE_MIN_FILMS = 3;
// Cover, one slide per film and the question slide must fit in a carousel.
const RETROSPECTIVE_MAX_FILMS = 6;

type ApiMovie = Movie & { id: number; slug: string };

type MonthStatsResponse = {
  month: string;
  alreadyPublished: boolean;
  screenings: number;
  cinemas: number;
  cities: number;
  topMovie: { movie: ApiMovie; screenings: number; cities: number } | null;
  oldestMovie: ApiMovie | null;
  highlights: ApiMovie[];
  byCity: { name: string; slug: string; count: number; lat: number | null; lon: number | null }[];
  topCinemas: { name: string; slug: string; city: string; count: number }[];
};

type RetrospectivesResponse = {
  retrospectives: {
    director: { id: number; name: string; slug: string | null; photoUrl: string | null };
    films: { movie: ApiMovie; from: string; cities: number }[];
  }[];
};

const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  if (!INTERNAL_API_KEY) throw new Error("INTERNAL_API_KEY is not set");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": INTERNAL_API_KEY,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`API ${path} failed: ${response.status} ${await response.text()}`);
  }
  return (response.status === 204 ? undefined : response.json().catch(() => undefined)) as T;
};

const recordSeriesPost = (kind: SeriesKind, key: string) =>
  api<void>("/socials/series/publish", {
    method: "POST",
    body: JSON.stringify({ kind, key, platform: "instagram_carousel" }),
  });

// The previous calendar month, the one "Klaps w liczbach" sums up on the 1st.
export const previousMonth = (today = todayInPoland()): string => {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export const fetchMonthStats = async (month: string): Promise<{ data: MonthStatsResponse; stats: MonthStats | null }> => {
  const data = await api<MonthStatsResponse>(`/socials/series/stats?month=${month}`);
  if (!data.topMovie || !data.oldestMovie || data.screenings < MIN_MONTH_SCREENINGS) {
    return { data, stats: null };
  }
  return {
    data,
    stats: {
      month,
      screenings: data.screenings,
      cinemas: data.cinemas,
      cities: data.cities,
      topMovie: { movie: data.topMovie.movie, screenings: data.topMovie.screenings },
      oldestMovie: data.oldestMovie,
      highlights: data.highlights,
      // Cities without cinema coordinates stay off the map.
      byCity: data.byCity
        .filter((c) => c.lat !== null && c.lon !== null)
        .map((c) => ({ city: c.name, lat: c.lat!, lon: c.lon!, count: c.count })),
      topCinemas: data.topCinemas.map((c) => ({ name: c.name, detail: c.city, count: c.count })),
    },
  };
};

// Display name for the cover: the surname of a Latin-script name.
const surname = (name: string): string => name.trim().split(/\s+/).at(-1) ?? name;

export const fetchRetrospectives = async (today = todayInPoland()): Promise<Retrospective[]> => {
  const dateFrom = addDays(today, 1);
  const dateTo = addDays(today, RETROSPECTIVE_DAYS_AHEAD);
  const data = await api<RetrospectivesResponse>(
    `/socials/series/retrospectives?dateFrom=${dateFrom}&dateTo=${dateTo}&minFilms=${RETROSPECTIVE_MIN_FILMS}`
  );
  return data.retrospectives
    // Names stored in another script (Korean, Japanese) cannot be read by
    // our followers nor found on TMDB, so those directors are skipped.
    .filter((r) => /^[\p{Script=Latin}\s.'-]+$/u.test(r.director.name))
    .map((r) => ({
      directorId: r.director.id,
      director: surname(r.director.name),
      directorFullName: r.director.name,
      films: r.films.slice(0, RETROSPECTIVE_MAX_FILMS),
    }));
};

const HASHTAGS = "#klaps #kino #klasykakina #repertuar";

export const buildMonthStatsCaption = (stats: MonthStats): string => {
  const [year, month] = stats.month.split("-").map(Number) as [number, number];
  const top = stats.topMovie;
  const oldest = stats.oldestMovie;
  return [
    `Klaps w liczbach: ${POLISH_MONTHS[month - 1]} ${year}`,
    "",
    `${stats.screenings} ${plural(stats.screenings, "seans", "seanse", "seansów")} klasyki w ${stats.cinemas} ${plural(stats.cinemas, "kinie", "kinach", "kinach")} i ${stats.cities} ${plural(stats.cities, "mieście", "miastach", "miastach")}.`,
    `Najczęściej grany: ${top.movie.title} (${top.screenings} ${plural(top.screenings, "seans", "seanse", "seansów")}).`,
    `Najstarszy film na ekranie: ${oldest.title} z ${oldest.productionYear} roku.`,
    "",
    "Repertuar klasyki w całej Polsce: link w bio.",
    "",
    HASHTAGS,
  ].join("\n");
};

export const buildRetrospectiveCaption = (retro: Retrospective): string => {
  const films = retro.films.map(
    ({ movie, from, cities }) =>
      `• ${movie.title} (${movie.productionYear}), od ${formatDayMonth(from)}, ${cities} ${plural(cities, "miasto", "miasta", "miast")}`
  );
  const tag = retro.director.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");
  return [
    `Przegląd: ${retro.directorFullName}`,
    "",
    `${retro.films.length} ${plural(retro.films.length, "film", "filmy", "filmów")} w kinach w najbliższych tygodniach:`,
    ...films,
    "",
    "Na który idziesz? Napisz w komentarzu.",
    "Godziny seansów: link w bio.",
    "",
    `${HASHTAGS} #${tag}`,
  ].join("\n");
};

const publishCarousel = async (slides: Buffer[], caption: string): Promise<string> => {
  await refreshInstagramToken();
  const urls = await Promise.all(slides.map((slide) => uploadTemporaryMedia(slide)));
  return publishInstagramCarousel({ slides: urls.map((imageUrl) => ({ imageUrl })), caption });
};

// 1st of the month: the previous month in numbers. Skipped when it was
// already published or the month is too thin.
export const publishMonthStats = async (month = previousMonth()): Promise<void> => {
  const { data, stats } = await fetchMonthStats(month);
  if (data.alreadyPublished) {
    console.log(`[series:stats] ${month} already published, skipping`);
    return;
  }
  if (!stats) {
    console.log(`[series:stats] ${month}: not enough data (${data.screenings} screenings), skipping`);
    return;
  }
  const slides = await renderSeries(buildMonthStats(stats));
  const mediaId = await publishCarousel(slides, buildMonthStatsCaption(stats));
  await recordSeriesPost("stats", month);
  console.log(`[series:stats] ${month} published as ${mediaId}`);
};

// Weekly check: the first upcoming retrospective whose director has a photo
// for the cover. Most weeks there is none, and that is fine.
export const publishRetrospective = async (): Promise<void> => {
  for (const retro of await fetchRetrospectives()) {
    if (!(await canBuildRetrospective(retro))) {
      console.log(`[series:retrospective] ${retro.directorFullName}: no photo, skipping`);
      continue;
    }
    const slides = await renderSeries(buildRetrospective(retro));
    const mediaId = await publishCarousel(slides, buildRetrospectiveCaption(retro));
    await recordSeriesPost("retrospective", String(retro.directorId ?? retro.directorFullName));
    console.log(`[series:retrospective] ${retro.directorFullName} published as ${mediaId}`);
    return;
  }
  console.log("[series:retrospective] no retrospective this week");
};
