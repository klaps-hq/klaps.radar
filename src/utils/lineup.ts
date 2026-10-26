import type { Screening } from "../types/types";

export const LINEUP_SIZE = 5;
// Keeps one big city from filling the whole weekly carousel.
const MAX_PER_CITY = 2;

// Picks the weekly carousel line-up from score-sorted candidates: one
// screening per movie, at most MAX_PER_CITY per city, then in date order
// so the carousel reads like a week's schedule.
export const pickWeeklyLineup = (
  candidates: Screening[],
  size: number = LINEUP_SIZE
): Screening[] => {
  const movies = new Set<string>();
  const perCity = new Map<string, number>();
  const picked: Screening[] = [];

  for (const screening of candidates) {
    if (picked.length >= size) break;
    const movieKey = `${screening.movie.title}|${screening.movie.productionYear}`;
    const city = screening.cinema.city.name;
    if (movies.has(movieKey) || (perCity.get(city) ?? 0) >= MAX_PER_CITY) {
      continue;
    }
    movies.add(movieKey);
    perCity.set(city, (perCity.get(city) ?? 0) + 1);
    picked.push(screening);
  }

  return picked.sort((a, b) => a.date.localeCompare(b.date));
};
