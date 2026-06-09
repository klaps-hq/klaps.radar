import { renderScreeningImage } from "../render/render";
import type { Screening } from "../types/types";

// Local design preview: renders both formats with sample data into ./previews.
// Replaces the old render-studio dev server.
const sampleScreening: Screening = {
  id: 0,
  date: "2026-06-12T18:00:00.000Z",
  movie: {
    title: "Pan Tadeusz",
    description:
      "Ekranizacja epopei narodowej Adama Mickiewicza w reżyserii Andrzeja Wajdy. Na tle sporu o zamek między rodami Sopliców i Horeszków rozkwita uczucie Tadeusza i Zosi, a w tle toczy się historia — nadciąga armia Napoleona.",
    productionYear: 1999,
    duration: 147,
    posterUrl: "https://image.tmdb.org/t/p/w780/3oSRt8qV2oxrr14Igo8och6nkN8.jpg",
    backdropUrl:
      "https://image.tmdb.org/t/p/w1280/df5iAHuH2brY9zXMeeRuL2AAE6O.jpg",
  },
  cinema: {
    name: "Kino Muranów",
    street: "ul. Generała Andersa 5",
    city: { name: "Warszawa", voivodeship: "mazowieckie" },
  },
};

const main = async () => {
  const [post, story] = await Promise.all([
    renderScreeningImage("post", sampleScreening),
    renderScreeningImage("story", sampleScreening),
  ]);

  await Promise.all([
    Bun.write("previews/instagram-post.jpg", post),
    Bun.write("previews/instagram-story.jpg", story),
  ]);

  console.log("Saved previews/instagram-post.jpg and previews/instagram-story.jpg");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
