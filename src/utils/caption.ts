import {
  addDays,
  formatPolishDate,
  splitScreeningDate,
  todayInPoland,
  truncateText,
} from "./format";
import type { Screening } from "../types/types";

// Weekday names in the accusative ("w sobotę"), Sunday-first to match getUTCDay().
const WEEKDAYS_ACCUSATIVE = [
  "W niedzielę",
  "W poniedziałek",
  "We wtorek",
  "W środę",
  "W czwartek",
  "W piątek",
  "W sobotę",
];

// Films at least this old are pitched as classics in the hook.
const CLASSIC_MIN_AGE_YEARS = 40;

const BASE_HASHTAGS = ["#klaps", "#kinostudyjne", "#klasykakina"];

export const describeWhen = (screeningDate: string, today: string): string => {
  if (screeningDate === today) return "Dziś";
  if (screeningDate === addDays(today, 1)) return "Jutro";

  const [y, m, d] = screeningDate.split("-").map(Number);
  return WEEKDAYS_ACCUSATIVE[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
};

// First caption line, the only one visible before "more" in the feed, so it
// carries the when/where instead of repeating the title from the image.
export const buildHook = (
  screening: Screening,
  today: string = todayInPoland()
): string => {
  const { date } = splitScreeningDate(screening.date);
  const age = Number(today.slice(0, 4)) - screening.movie.productionYear;
  const pitch =
    age >= CLASSIC_MIN_AGE_YEARS
      ? `klasyka sprzed ${age} lat na dużym ekranie`
      : "seans na dużym ekranie";

  return `${describeWhen(date, today)}, ${screening.cinema.city.name}: ${pitch}`;
};

// "Gorzów Wielkopolski" -> "gorzowwielkopolski". NFD does not split "ł".
const toHashtagSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");

export const buildHashtags = (screening: Screening): string => {
  const city = toHashtagSlug(screening.cinema.city.name);
  return [...BASE_HASHTAGS, ...(city ? [`#kino${city}`, `#${city}`] : [])].join(
    " "
  );
};

const formatShortDate = (screening: Screening): string => {
  const { date, time } = splitScreeningDate(screening.date);
  const [, m, d] = date.split("-");
  return `${Number(d)}.${m}${time ? `, ${time}` : ""}`;
};

// Polish plural of "seans" for a count: 1 seans, 2-4 seanse, 5+ seansów
// (12-14 take "seansów" too).
export const pluralSeans = (n: number): string => {
  if (n === 1) return "seans";
  const lastTwo = n % 100;
  const last = n % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
    ? "seanse"
    : "seansów";
};

// Caption for line-up posts (weekly carousel, line-up reel): the
// screenings as a numbered list that mirrors the slides or cards, with
// city tags for every city in it.
export const buildCarouselCaption = (
  lineup: Screening[],
  heading = `Tydzień w kinach studyjnych: ${lineup.length} ${pluralSeans(lineup.length)}, które warto zobaczyć na dużym ekranie`
): string => {
  const cities = [
    ...new Set(lineup.map((s) => toHashtagSlug(s.cinema.city.name))),
  ].filter(Boolean);

  return [
    heading,
    "",
    ...lineup.map(
      (s, i) =>
        `${i + 1}. ${s.movie.title} (${s.movie.productionYear}), ${formatShortDate(s)}, ${s.cinema.name}${
          s.cinema.instagramUsername ? ` (@${s.cinema.instagramUsername})` : ""
        }, ${s.cinema.city.name}`
    ),
    "",
    "Zapisz post, żeby nie przegapić, i oznacz osobę, z którą idziesz.",
    "Pełny repertuar kin studyjnych znajdziesz na klaps.space",
    "",
    [...BASE_HASHTAGS, ...cities.map((c) => `#kino${c}`)].join(" "),
  ].join("\n");
};

// Caption for a single screening (posts, Facebook, Threads, single-film
// reels): hook, title, when and where, synopsis, call to action, hashtags.
export const buildCaption = (
  screening: Screening,
  options?: { hashtags?: boolean; mentionCinema?: boolean }
): string => {
  const { movie, cinema } = screening;
  const { date, time } = splitScreeningDate(screening.date);
  // An @mention links only on Instagram; elsewhere it would be noise.
  const cinemaName =
    options?.mentionCinema && cinema.instagramUsername
      ? `${cinema.name} (@${cinema.instagramUsername})`
      : cinema.name;

  return [
    buildHook(screening),
    "",
    `${movie.title} (${movie.productionYear})`,
    `${formatPolishDate(date)}${time ? `, godz. ${time}` : ""}`,
    `${cinemaName}, ${cinema.street}, ${cinema.city.name}`,
    ...(movie.description
      ? ["", truncateText(movie.description, 350)]
      : []),
    "",
    "Oznacz osobę, z którą chcesz iść na ten seans.",
    "Pełny repertuar kin studyjnych znajdziesz na klaps.space",
    ...(options?.hashtags === false ? [] : ["", buildHashtags(screening)]),
  ].join("\n");
};
