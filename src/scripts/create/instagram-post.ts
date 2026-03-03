import { createInstagramPost } from "../../render/platforms/instagram-post";

const main = async () => {
  const dateFrom = Bun.argv[2]?.trim();
  const dateTo = Bun.argv[3]?.trim();

  if (!dateFrom || !dateTo) {
    console.error("Date from and date to are required");
    process.exit(1);
  }

  const numberOfCandidates = Bun.argv[4]?.trim()
    ? Number(Bun.argv[4]?.trim())
    : 30;

  const minScore = Bun.argv[5]?.trim() ? Number(Bun.argv[5]?.trim()) : 7.5;

  await createInstagramPost({
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
