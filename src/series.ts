import { getPersonPhotos } from "./media/tmdb";
import type { MapPoint, RankItem, SlideSpec } from "./render/series";
import type { Screening } from "./types/types";

// Series builders: data in, slide specs out. The render engine
// (src/render/series.tsx) does the rest, so a new series is a new builder.
type Movie = Screening["movie"];

// "Klaps w liczbach": a month of screenings in numbers.
export type MonthStats = {
  month: string; // "2026-10"
  screenings: number;
  cinemas: number;
  cities: number;
  topMovie: { movie: Movie; screenings: number };
  oldestMovie: Movie;
  byCity: MapPoint[];
  // Cinemas with the most screenings, best first.
  topCinemas: RankItem[];
  // A few movies of the month for the cover strip.
  highlights: Movie[];
};

export const POLISH_MONTHS = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];

const formatThousands =(n: number): string =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const buildMonthStats = (stats: MonthStats): SlideSpec[] => {
  const [year, month] = stats.month.split("-").map(Number) as [number, number];
  return [
    {
      kind: "cover",
      date: `${POLISH_MONTHS[month - 1]} ${year}`,
      eyebrow: "Klaps w liczbach",
      value: formatThousands(stats.screenings),
      label: "seansów klasyki",
      strip: stats.highlights.slice(0, 6).map((movie) => ({ movie, kind: "poster" })),
    },
    {
      kind: "stat",
      eyebrow: "Najczęściej grany",
      value: `${stats.topMovie.screenings}×`,
      title: stats.topMovie.movie.title,
      art: { movie: stats.topMovie.movie, kind: "still" },
    },
    { kind: "map", eyebrow: "Najwięcej seansów", title: "Mapa klasyki", points: stats.byCity },
    { kind: "ranking", eyebrow: "Najaktywniejsze kina", unit: "seansów", items: stats.topCinemas.slice(0, 5) },
    {
      kind: "stat",
      eyebrow: "Najstarszy na ekranie",
      value: String(stats.oldestMovie.productionYear),
      title: stats.oldestMovie.title,
      art: { movie: stats.oldestMovie, kind: "still" },
    },
    { kind: "outro", text: "Cały repertuar klasyki z kin w Polsce w jednym miejscu" },
  ];
};

// "Przegląd": several films of one director on screen in the coming weeks.
export type Retrospective = {
  // Display name ("Kubrick") and the full name for the TMDB photo lookup.
  director: string;
  directorFullName: string;
  // API id, recorded once published so the director is not repeated.
  directorId?: number;
  films: { movie: Movie; from: string; cities: number }[];
};

export const formatDayMonth = (iso: string): string => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${m}`;
};

export const plural = (n: number, one: string, few: string, many: string): string =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

// The cover is the director's portrait; without a photo on TMDB the
// retrospective is skipped rather than posted with a weaker cover.
export const canBuildRetrospective = async (retro: Retrospective): Promise<boolean> =>
  (await getPersonPhotos(retro.directorFullName)).length > 0;

export const buildRetrospective = (retro: Retrospective): SlideSpec[] => {
  const n = retro.films.length;
  const first = retro.films.map((f) => f.from).sort()[0]!;
  return [
    {
      kind: "hero",
      eyebrow: "Przegląd",
      title: retro.director,
      lines: [
        `${n} ${plural(n, "film", "filmy", "filmów")} w kinach · od ${formatDayMonth(first)}`,
      ],
      art: { kind: "person", name: retro.directorFullName },
    },
    ...retro.films.map(
      ({ movie, from, cities }, i): SlideSpec => ({
        kind: "film",
        index: i + 1,
        title: movie.title,
        meta: `od ${formatDayMonth(from)} · ${cities} ${plural(cities, "miasto", "miasta", "miast")}`,
        art: { movie, kind: "poster" },
      })
    ),
    {
      kind: "question",
      eyebrow: "Na który idziesz?",
      items: retro.films.map(({ movie }) => movie.title),
      footer: "Napisz w komentarzu",
    },
  ];
};
