import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Platform } from "../types/types";

// Movies shown in the Instagram feed, line-ups included. The API cooldown
// only knows the one screening a post reserves, so a film that was the
// third card of a reel could return as the next day's single-film reel.
// This ledger covers the rest of each line-up; it lives on the data volume
// next to the art cache and is best effort (a lost file only means the
// API cooldown alone applies).
export const FEED_PLATFORMS: Platform[] = ["instagram_post", "instagram_reel", "instagram_carousel"];

const FILE =
  process.env.FEED_HISTORY_FILE ?? (existsSync("/data") ? "/data/feed-history.json" : ".cache/feed-history.json");
// Same as the API's per-movie cooldown.
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

type Entry = { movie: string; at: string };

const load = (): Promise<Entry[]> =>
  Bun.file(FILE)
    .json()
    .then((entries) => (Array.isArray(entries) ? entries : []))
    .catch(() => []);

const recent = (entries: Entry[], now: number) =>
  entries.filter((e) => Date.parse(e.at) >= now - COOLDOWN_MS);

/** "<title>|<year>" keys of the movies shown in the feed in the cooldown. */
export const recentFeedMovies = async (now = Date.now()): Promise<Set<string>> =>
  new Set(recent(await load(), now).map((e) => e.movie));

export const recordFeedMovies = async (movies: string[], now = new Date()): Promise<void> => {
  const entries = [...recent(await load(), now.getTime()), ...movies.map((movie) => ({ movie, at: now.toISOString() }))];
  try {
    await mkdir(dirname(FILE), { recursive: true });
    await Bun.write(FILE, JSON.stringify(entries, null, 2));
  } catch (error) {
    console.warn("[feed-history] write failed:", error instanceof Error ? error.message : error);
  }
};
