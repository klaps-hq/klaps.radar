import { createInstagramMedia } from "../../publish";
import { addDays, todayInPoland } from "../../utils/format";

const main = async () => {
  // Cron-friendly defaults: today plus tomorrow ("co gra dzis/jutro").
  const dateFrom = Bun.argv[2]?.trim() || todayInPoland();
  const dateTo = Bun.argv[3]?.trim() || addDays(dateFrom, 1);

  // API scoring is an integer point sum (deep classic 30 + multi-city 20 +
  // multi-genre 10 = max 60); the DTO rejects non-integers.
  const numberOfCandidates = parseInt(Bun.argv[4]?.trim() || "30", 10);
  const minScore = parseInt(Bun.argv[5]?.trim() || "30", 10);

  await createInstagramMedia("instagram_story", {
    dateFrom,
    dateTo,
    minScore,
    numberOfCandidates,
  });
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
