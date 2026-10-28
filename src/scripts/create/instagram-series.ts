import { previousMonth, publishMonthStats, publishRetrospective } from "../../series-publish";

// Manual run of an editorial series, same code path as the scheduler:
//   bun run create:instagram-series stats [YYYY-MM]
//   bun run create:instagram-series retrospective
const main = async () => {
  const kind = Bun.argv[2]?.trim();
  if (kind === "stats") return publishMonthStats(Bun.argv[3]?.trim() || previousMonth());
  if (kind === "retrospective") return publishRetrospective();
  throw new Error('Usage: instagram-series <stats [YYYY-MM] | retrospective>');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
