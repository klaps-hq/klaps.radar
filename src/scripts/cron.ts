import { Cron } from "croner";
import { createInstagramMedia } from "../publish";
import type { Platform } from "../types/types";
import { addDays, todayInPoland } from "../utils/format";

// Long-running container entrypoint: schedules the Instagram publishing
// jobs in-process, so the deployment needs nothing beyond this container.
const TIMEZONE = "Europe/Warsaw";

const POST_CRON = process.env.IG_POST_CRON || "30 11 * * *";
const STORY_CRON = process.env.IG_STORY_CRON || "30 8 * * *";

const runJob = async (platform: Platform, daysAhead: number) => {
  const dateFrom = todayInPoland();
  const dateTo = addDays(dateFrom, daysAhead);

  console.log(`[${platform}] run for ${dateFrom}..${dateTo}`);

  try {
    await createInstagramMedia(platform, {
      dateFrom,
      dateTo,
      minScore: 30,
      numberOfCandidates: 30,
    });
  } catch (error) {
    // Never crash the scheduler - a failed day is just a skipped day.
    console.error(`[${platform}] failed:`, error);
  }
};

new Cron(POST_CRON, { timezone: TIMEZONE }, () => runJob("instagram_post", 6));
new Cron(STORY_CRON, { timezone: TIMEZONE }, () =>
  runJob("instagram_story", 1)
);

console.log(
  `klaps-radar scheduler started (post: "${POST_CRON}", story: "${STORY_CRON}", tz: ${TIMEZONE})`
);
