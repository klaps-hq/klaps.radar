import { mkdir } from "node:fs/promises";
import { buildCaptionPreview } from "../publish";
import { planReel, reelRange, renderReelPlan, type ReelKind } from "../reels";
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

// Next date (from tomorrow) that falls on weekday `dow` (0 = Sunday).
const nextWeekday = (from: string, dow: number): string => {
  for (let i = 1; i <= 7; i += 1) {
    const d = addDays(from, i);
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === dow) return d;
  }
  return from;
};

// Each reel series as it would run on its next publish day, from the live
// candidates for its own date range (read-only).
const REEL_DAYS: [ReelKind, number][] = [
  ["classic", 2],
  ["weekend", 4],
  ["sunday", 6],
];

// The Halloween reel is previewed only with live data: the sample has no horror.
if (process.argv.includes("--live")) REEL_DAYS.push(["halloween", -1]);

const renderReels = async (fallback: Screening[]) => {
  const live = process.argv.includes("--live");
  const out: { kind: ReelKind; day: string; caption: string; size: number }[] = [];
  for (const [kind, dow] of REEL_DAYS) {
    const day = dow < 0 ? `${today.slice(0, 4)}-10-30` : nextWeekday(today, dow);
    const range = reelRange(kind, day);
    const candidates = live
      ? (
          await fetchCandidate({
            platform: "instagram_post",
            ...range,
            minScore: 30,
            numberOfCandidates: 30,
            maxPosts: 10,
          })
        ).candidates
      : fallback;
    const plan = await planReel(kind, candidates, day);
    if (!plan) {
      console.log(`reel ${kind}: nothing to show for ${range.dateFrom}..${range.dateTo}`);
      continue;
    }
    const reel = await renderReelPlan(plan);
    await Bun.write(`previews/reel-${kind}.mp4`, reel.video);
    out.push({ kind, day, caption: reel.caption, size: reel.video.length });
  }
  return out;
};

const main = async () => {
  const screenings = await loadScreenings();
  const lead = screenings[0];
  if (!lead) throw new Error("No screenings to preview");
  const lineup = pickWeeklyLineup(screenings);

  await mkdir("previews", { recursive: true });
  const [post, story, carousel] = await Promise.all([
    renderScreeningImage("post", lead),
    renderScreeningImage("story", lead),
    renderCarouselImages(lineup, {
      dateFrom: today,
      dateTo: addDays(today, 6),
    }),
  ]);
  const reels = await renderReels(screenings);

  await Promise.all([
    Bun.write("previews/instagram-post.jpg", post),
    Bun.write("previews/instagram-story.jpg", story),
    ...carousel.map((slide, i) =>
      Bun.write(`previews/carousel-${i + 1}.jpg`, slide)
    ),
    Bun.write(
      "previews/captions.txt",
      [
        "=== post ===",
        buildCaptionPreview(lead),
        "",
        ...reels.flatMap((r) => [`=== reel ${r.kind} (${r.day}) ===`, r.caption, ""]),
        "=== carousel ===",
        buildCarouselCaption(lineup),
        "",
      ].join("\n")
    ),
  ]);

  console.log(
    `Saved previews/: post, story, ${reels.map((r) => `reel-${r.kind} (${r.day}, ${(r.size / 1e6).toFixed(1)} MB)`).join(", ")}, ${carousel.length} carousel slides, captions.txt`
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
