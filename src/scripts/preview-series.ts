import { mkdir } from "node:fs/promises";
import { renderSeries } from "../render/series";
import { buildMonthStats, buildRetrospective } from "../series";
import type { Screening } from "../types/types";

// Design preview of the editorial series on sample numbers (no stats
// endpoint in the API yet). Art comes from TMDB, so TMDB_API_KEY is needed:
// bun --env-file .env src/scripts/preview-series.ts
const movie = (title: string, titleOriginal: string, productionYear: number): Screening["movie"] => ({
  title,
  titleOriginal,
  productionYear,
  description: null,
  duration: null,
  posterUrl: null,
  backdropUrl: null,
});

const shining = movie("Lśnienie", "The Shining", 1980);
const caligari = movie("Gabinet doktora Caligari", "Das Cabinet des Dr. Caligari", 1920);
const odyssey = movie("2001: Odyseja kosmiczna", "2001: A Space Odyssey", 1968);
const clockwork = movie("Mechaniczna pomarańcza", "A Clockwork Orange", 1971);

const stats = buildMonthStats({
  month: "2026-10",
  screenings: 1248,
  cinemas: 87,
  cities: 34,
  topMovie: { movie: shining, screenings: 64 },
  oldestMovie: caligari,
  highlights: [
    shining,
    movie("Ojciec chrzestny", "The Godfather", 1972),
    movie("Psychoza", "Psycho", 1960),
    movie("Łowca androidów", "Blade Runner", 1982),
    movie("Rejs", "Rejs", 1970),
    movie("Taksówkarz", "Taxi Driver", 1976),
  ],
  topCinemas: [
    { name: "Kino Muranów", detail: "Warszawa", count: 58 },
    { name: "Kino Pod Baranami", detail: "Kraków", count: 51 },
    { name: "Kino Nowe Horyzonty", detail: "Wrocław", count: 47 },
    { name: "Kino Muza", detail: "Poznań", count: 39 },
    { name: "Kino Charlie", detail: "Łódź", count: 33 },
  ],
  byCity: [
    { city: "Warszawa", lon: 21.01, lat: 52.23, count: 212 },
    { city: "Kraków", lon: 19.94, lat: 50.06, count: 168 },
    { city: "Wrocław", lon: 17.03, lat: 51.11, count: 121 },
    { city: "Poznań", lon: 16.93, lat: 52.41, count: 98 },
    { city: "Gdańsk", lon: 18.65, lat: 54.35, count: 87 },
    { city: "Łódź", lon: 19.46, lat: 51.76, count: 81 },
    { city: "Katowice", lon: 19.02, lat: 50.26, count: 54 },
    { city: "Lublin", lon: 22.57, lat: 51.25, count: 41 },
    { city: "Szczecin", lon: 14.55, lat: 53.43, count: 33 },
    { city: "Toruń", lon: 18.6, lat: 53.01, count: 26 },
    { city: "Białystok", lon: 23.16, lat: 53.13, count: 22 },
    { city: "Bydgoszcz", lon: 18.0, lat: 53.12, count: 20 },
    { city: "Rzeszów", lon: 22.0, lat: 50.04, count: 18 },
    { city: "Olsztyn", lon: 20.48, lat: 53.78, count: 15 },
  ],
});

const retro = buildRetrospective({
  director: "Kubrick",
  directorFullName: "Stanley Kubrick",
  films: [
    { movie: odyssey, from: "2026-11-03", cities: 6 },
    { movie: clockwork, from: "2026-11-10", cities: 4 },
    { movie: shining, from: "2026-11-17", cities: 9 },
  ],
});

const main = async () => {
  await mkdir("previews/series", { recursive: true });
  const [statsSlides, retroSlides] = await Promise.all([renderSeries(stats), renderSeries(retro)]);
  await Promise.all([
    ...statsSlides.map((s, i) => Bun.write(`previews/series/liczby-${i + 1}.jpg`, s)),
    ...retroSlides.map((s, i) => Bun.write(`previews/series/przeglad-${i + 1}.jpg`, s)),
  ]);
  console.log(`Saved ${statsSlides.length} + ${retroSlides.length} slides to previews/series/`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
