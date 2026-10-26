import { mkdir } from "node:fs/promises";
import { buildCaptionPreview, prepareLineupReel } from "../publish";
import { renderCarouselImages, renderScreeningImage } from "../render/render";
import type { Screening } from "../types/types";
import { buildCarouselCaption } from "../utils/caption";
import { fetchCandidate } from "../utils/candidate";
import { addDays, todayInPoland } from "../utils/format";
import { pickWeeklyLineup } from "../utils/lineup";

// Local design preview: renders every format into ./previews - post, story,
// reel (mp4) and the weekly carousel, plus the captions. Sample data by
// default; `--live` uses the real upcoming candidates from the API instead
// (read-only, nothing is reserved). Replaces the old render-studio server.
const sample = (
  id: number,
  date: string,
  movie: Partial<Screening["movie"]> & { title: string; productionYear: number },
  cinema: { name: string; street: string; city: string; instagram?: string }
): Screening => ({
  id,
  date,
  movie: {
    description: null,
    duration: null,
    posterUrl: null,
    backdropUrl: null,
    ...movie,
  },
  cinema: {
    name: cinema.name,
    street: cinema.street,
    city: { name: cinema.city, voivodeship: null },
    instagramUsername: cinema.instagram ?? null,
  },
});

const today = todayInPoland();
const sampleScreenings: Screening[] = [
  sample(
    1,
    `${addDays(today, 1)}T18:00:00.000Z`,
    {
      title: "Pan Tadeusz",
      productionYear: 1999,
      duration: 147,
      description:
        "Ekranizacja epopei narodowej Adama Mickiewicza w reżyserii Andrzeja Wajdy. Na tle sporu o zamek między rodami Sopliców i Horeszków rozkwita uczucie Tadeusza i Zosi, a w tle toczy się historia: nadciąga armia Napoleona.",
      posterUrl: "/3oSRt8qV2oxrr14Igo8och6nkN8.jpg",
      backdropUrl: "/df5iAHuH2brY9zXMeeRuL2AAE6O.jpg",
    },
    { name: "Kino Muranów", street: "ul. Generała Andersa 5", city: "Warszawa", instagram: "kinomuranow" }
  ),
];

const loadScreenings = async (): Promise<Screening[]> => {
  if (!process.argv.includes("--live")) return sampleScreenings;

  // maxPosts at the API's cap so an already published day does not hide
  // the candidates.
  const response = await fetchCandidate({
    platform: "instagram_post",
    dateFrom: today,
    dateTo: addDays(today, 6),
    minScore: 30,
    numberOfCandidates: 30,
    maxPosts: 10,
  });
  return response.candidates;
};

const main = async () => {
  const screenings = await loadScreenings();
  const lead = screenings[0];
  if (!lead) throw new Error("No screenings to preview");
  const lineup = pickWeeklyLineup(screenings);
  // The reel covers the next few days, like the cron job (today + 3).
  const reelEnd = addDays(today, 3);
  const nearby = screenings.filter((s) => s.date.slice(0, 10) <= reelEnd);

  await mkdir("previews", { recursive: true });
  const [post, story, reel, carousel] = await Promise.all([
    renderScreeningImage("post", lead),
    renderScreeningImage("story", lead),
    prepareLineupReel(nearby.length ? nearby : screenings),
    renderCarouselImages(lineup, {
      dateFrom: today,
      dateTo: addDays(today, 6),
    }),
  ]);

  await Promise.all([
    Bun.write("previews/instagram-post.jpg", post),
    Bun.write("previews/instagram-story.jpg", story),
    Bun.write("previews/instagram-reel.mp4", reel.video),
    ...carousel.map((slide, i) =>
      Bun.write(`previews/carousel-${i + 1}.jpg`, slide)
    ),
    Bun.write(
      "previews/captions.txt",
      [
        "=== post ===",
        buildCaptionPreview(lead),
        "",
        "=== reel ===",
        reel.caption,
        "",
        "=== carousel ===",
        buildCarouselCaption(lineup),
        "",
      ].join("\n")
    ),
  ]);

  console.log(
    `Saved previews/: post, story, reel (${reel.lineup.length} screenings, ${(reel.video.length / 1e6).toFixed(1)} MB), ${carousel.length} carousel slides, captions.txt`
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
