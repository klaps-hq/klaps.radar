import type { Screening } from "../types/types";

// Extra artwork from TMDB for the renderers. Our DB keeps one backdrop and
// one poster per movie; TMDB also has textless key art (posters with no
// title text), which is already composed for portrait and fixes the bad
// crops a 16:9 backdrop gives in 4:5 / 9:16 cards, plus more stills for the
// reel montage. Optional: without TMDB_API_KEY, or on any failure, the
// renderers fall back to the DB images.
const TMDB_API = "https://api.themoviedb.org/3";
// Smaller stills are usually frame grabs too soft for a 1080 px card.
const MIN_WIDTH = 1280;
const MAX_BACKDROPS = 4;

export type MovieArt = {
  // TMDB paths ("/abc.jpg"), like the DB fields.
  textlessPoster: string | null;
  backdrops: string[];
};

type TmdbImage = {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
  width: number;
};

type TmdbSearchResult = {
  id: number;
  backdrop_path: string | null;
  poster_path: string | null;
  release_date?: string;
};

const tmdbGet = async <T>(
  path: string,
  params: Record<string, string>
): Promise<T | null> => {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;

  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) }).catch(
    () => null
  );
  return response?.ok ? ((await response.json()) as T) : null;
};

// Prefers the result whose images match the ones in our DB (the scraper
// took them from TMDB), then the one released in the production year.
const findTmdbId = async (
  movie: Screening["movie"]
): Promise<number | null> => {
  const queries = [...new Set([movie.titleOriginal, movie.title].filter(Boolean))];
  for (const query of queries) {
    const search = await tmdbGet<{ results: TmdbSearchResult[] }>(
      "/search/movie",
      { query: query!, year: String(movie.productionYear) }
    );
    const results = search?.results ?? [];
    const byImage = results.find(
      (r) =>
        (movie.backdropUrl && r.backdrop_path === movie.backdropUrl) ||
        (movie.posterUrl && r.poster_path === movie.posterUrl)
    );
    const byYear = results.find((r) =>
      r.release_date?.startsWith(String(movie.productionYear))
    );
    const match = byImage ?? byYear;
    if (match) return match.id;
  }
  return null;
};

const best = (images: TmdbImage[]): TmdbImage[] =>
  images
    .filter((i) => i.width >= MIN_WIDTH)
    .sort((a, b) => b.vote_average - a.vote_average);

const cache = new Map<string, Promise<MovieArt>>();

export const getMovieArt = (movie: Screening["movie"]): Promise<MovieArt> => {
  const key = `${movie.title}|${movie.productionYear}`;
  if (!cache.has(key)) cache.set(key, loadMovieArt(movie));
  return cache.get(key)!;
};

const loadMovieArt = async (movie: Screening["movie"]): Promise<MovieArt> => {
  const fallback: MovieArt = {
    textlessPoster: null,
    backdrops: movie.backdropUrl ? [movie.backdropUrl] : [],
  };

  try {
    const id = await findTmdbId(movie);
    if (!id) return fallback;

    const images = await tmdbGet<{ posters: TmdbImage[]; backdrops: TmdbImage[] }>(
      `/movie/${id}/images`,
      // "null" = images without any text, i.e. textless art.
      { include_image_language: "null,en,pl" }
    );
    if (!images) return fallback;

    const textlessPoster =
      best(images.posters.filter((p) => p.iso_639_1 === null))[0]?.file_path ??
      null;
    // Textless stills first; the DB backdrop always stays in the set.
    const stills = best(images.backdrops)
      .sort((a, b) => Number(a.iso_639_1 !== null) - Number(b.iso_639_1 !== null))
      .map((b) => b.file_path);
    const backdrops = [
      ...new Set([...(movie.backdropUrl ? [movie.backdropUrl] : []), ...stills]),
    ].slice(0, MAX_BACKDROPS);

    return { textlessPoster, backdrops: backdrops.length ? backdrops : fallback.backdrops };
  } catch {
    return fallback;
  }
};
