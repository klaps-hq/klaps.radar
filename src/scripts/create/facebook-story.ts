import { createSocialMedia } from "../../publish";
import { addDays, todayInPoland } from "../../utils/format";

const main = async () => {
  // Cron-friendly defaults: today plus tomorrow.
  const dateFrom = Bun.argv[2]?.trim() || todayInPoland();
  const dateTo = Bun.argv[3]?.trim() || addDays(dateFrom, 1);

  const numberOfCandidates = parseInt(Bun.argv[4]?.trim() || "30", 10);
  const minScore = parseInt(Bun.argv[5]?.trim() || "30", 10);

  await createSocialMedia("facebook_story", {
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
