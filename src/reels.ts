import { preferTextlessArt } from "./media/tmdb";
import {
  renderAnniversaryReel,
  renderLineupReel,
  renderSpotlightReel,
  type ReelRenderOptions,
} from "./render/video";
import type { Screening } from "./types/types";
import { buildCaption, buildCarouselCaption, pluralSeans } from "./utils/caption";
import { addDays, splitScreeningDate, todayInPoland } from "./utils/format";
import { pickWeeklyLineup } from "./utils/lineup";

// The weekly reel series. Each runs on its own day with its own date range
// (see the scheduler):
// - classic: "Klasyka tygodnia" on Tuesday, one older film from the coming
//   week; in a week with a round premiere anniversary, that film instead,
//   as an anniversary reel;
// - weekend: "Weekend w kinie" on Thursday, a line-up from Friday to Sunday;
// - sunday: "Seans na niedzielę" on Saturday, one film on Sunday;
// - halloween: "Halloween w kinie", once a year on 30 October, a line-up of
//   horror screenings on Halloween and the day after, in the Halloween theme;
// - independence: "11 listopada w kinie", once a year two days before
//   11 November, a line-up of Polish films around the holiday.
export type ReelKind = "classic" | "weekend" | "sunday" | "halloween" | "independence";

export const REEL_SERIES: Record<ReelKind, string> = {
  classic: "Klasyka tygodnia",
  weekend: "Weekend w kinie",
  sunday: "Seans na niedzielę",
  halloween: "Halloween w kinie",
  independence: "11 listopada w kinie",
};

// Screenings in a line-up reel: few enough that each card can be read.
const REEL_LINEUP_SIZE = 4;
// The yearly line-ups run one card longer: each is the year's only one.
const THEMED_LINEUP_SIZE = 5;
// Genre id of horror in api.klaps.space (/genres).
const HORROR_GENRE_ID = 5;
const isPolish = (s: Screening) =>
  s.movie.movies_countries?.some((c) => c.country.countryCode === "PL") ?? false;
export const MIN_LINEUP_SCREENINGS = 3;
// A "classic" is at least this old.
const CLASSIC_MIN_AGE = 25;
// Anniversaries count in steps of this many years, from the first step.
const ANNIVERSARY_STEP = 5;
// An anniversary qualifies when it falls this close to the publish day.
const ANNIVERSARY_WINDOW_DAYS = { before: 3, after: 7 };

type Anniversary = { years: number; premiere: string };

export type ReelPlan =
  | { kind: "weekend" | "halloween" | "independence"; featured: Screening; lineup: Screening[] }
  | { kind: "classic" | "sunday"; featured: Screening; anniversary?: Anniversary };

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// A round anniversary of the world premiere close to `today`, in the year
// of the screening.
export const findAnniversary = (
  screening: Screening,
  today: string = todayInPoland()
): Anniversary | null => {
  const premiere = screening.movie.worldPremiereDate?.slice(0, 10);
  if (!premiere) return null;
  const year = Number(splitScreeningDate(screening.date).date.slice(0, 4));
  const years = year - Number(premiere.slice(0, 4));
  if (years < ANNIVERSARY_STEP || years % ANNIVERSARY_STEP !== 0) return null;
  const anniversary = `${year}${premiere.slice(4)}`;
  const offset = daysBetween(today, anniversary);
  if (offset < -ANNIVERSARY_WINDOW_DAYS.before || offset > ANNIVERSARY_WINDOW_DAYS.after) {
    return null;
  }
  return { years, premiere };
};

// Chooses what the reel shows. Candidates come score-sorted from the API;
// single-film reels prefer films with textless key art (they fill the
// screen with it). Returns null when there is not enough to show.
export const planReel = async (
  kind: ReelKind,
  candidates: Screening[],
  today: string = todayInPoland()
): Promise<ReelPlan | null> => {
  if (candidates.length === 0) return null;

  if (kind === "weekend") {
    const lineup = pickWeeklyLineup(await preferTextlessArt(candidates), REEL_LINEUP_SIZE);
    if (lineup.length < MIN_LINEUP_SCREENINGS) return null;
    // The top-scored screening is reserved; it leads the line-up's picks.
    return { kind, featured: candidates[0]!, lineup };
  }

  if (kind === "halloween" || kind === "independence") {
    const pool = candidates.filter((s) =>
      kind === "halloween"
        ? s.movie.movies_genres?.some((g) => g.genreId === HORROR_GENRE_ID)
        : isPolish(s)
    );
    const lineup = pickWeeklyLineup(await preferTextlessArt(pool), THEMED_LINEUP_SIZE);
    if (lineup.length < MIN_LINEUP_SCREENINGS) return null;
    // The reserved screening (and the music's mood) is the best of the pool.
    return { kind, featured: pool[0]!, lineup };
  }

  if (kind === "classic") {
    for (const screening of candidates) {
      const anniversary = findAnniversary(screening, today);
      if (anniversary) return { kind, featured: screening, anniversary };
    }
    const year = Number(today.slice(0, 4));
    const classics = candidates.filter(
      (s) => year - s.movie.productionYear >= CLASSIC_MIN_AGE
    );
    const pool = await preferTextlessArt(classics.length ? classics : candidates);
    return { kind, featured: pool[0]! };
  }

  return { kind, featured: (await preferTextlessArt(candidates))[0]! };
};

const formatDayMonth = (screening: Screening): string => {
  const [, m, d] = splitScreeningDate(screening.date).date.split("-");
  return `${Number(d)}.${m}`;
};

// Renders the planned reel and writes its caption; `tagged` are the
// screenings whose cinemas get tagged. With `still`, `video` is a single
// JPEG frame (previews) instead of the MP4.
export const renderReelPlan = async (plan: ReelPlan, options: ReelRenderOptions = {}) => {
  if ("lineup" in plan) {
    const { lineup } = plan;
    const theme = plan.kind === "weekend" ? undefined : plan.kind;
    const series = REEL_SERIES[plan.kind];
    const first = formatDayMonth(lineup[0]!);
    const last = formatDayMonth(lineup.at(-1)!);
    const span = first === last ? first : `${first} – ${last}`;
    const count = `${lineup.length} ${pluralSeans(lineup.length)}`;
    const video = await renderLineupReel(
      lineup,
      // A themed cover carries the series name itself.
      theme === "halloween"
        ? [span, `${count} grozy`]
        : theme === "independence"
          ? ["11 listopada", `${span} · ${count}`]
          : [series, `${count} · ${span}`],
      plan.featured,
      { ...options, theme }
    );
    const caption =
      theme === "halloween"
        ? buildCarouselCaption(
            lineup,
            `${series}: ${count} grozy na dużym ekranie. Zamiast przebrania, bilet do kina 🎃`,
            ["#halloween", "#horror"]
          )
        : theme === "independence"
          ? buildCarouselCaption(
              lineup,
              `${series}: ${count} polskiego kina na dużym ekranie. Świętuj z polskim filmem 🇵🇱`,
              ["#11listopada", "#polskiekino"]
            )
          : buildCarouselCaption(lineup, `${series}: ${count}, które warto zobaczyć na dużym ekranie`);
    return { video, caption, tagged: lineup };
  }

  const screening = plan.featured;
  const { title, productionYear } = screening.movie;
  if (plan.anniversary) {
    const { years, premiere } = plan.anniversary;
    const video = await renderAnniversaryReel(screening, years, premiere, options);
    const caption = [
      `${years} lat temu, ${premiere.split("-").reverse().join(".")}, premierę miał film „${title}” (${productionYear}). Wraca na duży ekran:`,
      "",
      buildCaption(screening, { mentionCinema: true }),
    ].join("\n");
    return { video, caption, tagged: [screening] };
  }

  const series = REEL_SERIES[plan.kind];
  const video = await renderSpotlightReel(screening, series, options);
  const caption = [
    `${series}: „${title}” (${productionYear})`,
    "",
    buildCaption(screening, { mentionCinema: true }),
  ].join("\n");
  return { video, caption, tagged: [screening] };
};

// Date range each series looks at, relative to the publish day.
export const reelRange = (kind: ReelKind, today: string = todayInPoland()) => {
  switch (kind) {
    case "classic":
      return { dateFrom: today, dateTo: addDays(today, 6) };
    case "weekend":
      return { dateFrom: addDays(today, 1), dateTo: addDays(today, 3) };
    case "sunday":
      return { dateFrom: addDays(today, 1), dateTo: addDays(today, 1) };
    case "halloween":
      return { dateFrom: addDays(today, 1), dateTo: addDays(today, 2) };
    // Published on 9 November: the eve of the holiday, the day and the day after.
    case "independence":
      return { dateFrom: addDays(today, 1), dateTo: addDays(today, 3) };
  }
};
