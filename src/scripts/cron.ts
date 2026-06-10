import { Cron } from "croner";
import { isFacebookConfigured } from "../facebook";
import { createSocialMedia } from "../publish";
import { isThreadsConfigured } from "../threads";
import type { Platform } from "../types/types";
import { addDays, todayInPoland } from "../utils/format";

// Long-running container entrypoint: schedules the publishing jobs
// in-process, so the deployment needs nothing beyond this container.
const TIMEZONE = "Europe/Warsaw";

const POST_CRON = process.env.IG_POST_CRON || "30 11 * * *";
const STORY_CRON = process.env.IG_STORY_CRON || "30 8 * * *";
const FB_POST_CRON = process.env.FB_POST_CRON || "0 12 * * *";
const FB_STORY_CRON = process.env.FB_STORY_CRON || "45 8 * * *";
const THREADS_POST_CRON = process.env.THREADS_POST_CRON || "0 13 * * *";

const runJob = async (platform: Platform, daysAhead: number) => {
  const dateFrom = todayInPoland();
  const dateTo = addDays(dateFrom, daysAhead);

  console.log(`[${platform}] run for ${dateFrom}..${dateTo}`);

  try {
    await createSocialMedia(platform, {
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

if (isFacebookConfigured()) {
  new Cron(FB_POST_CRON, { timezone: TIMEZONE }, () =>
    runJob("facebook_post", 6)
  );
  new Cron(FB_STORY_CRON, { timezone: TIMEZONE }, () =>
    runJob("facebook_story", 1)
  );
} else {
  console.log(
    "Facebook not configured (FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN) - skipping FB jobs"
  );
}

if (isThreadsConfigured()) {
  new Cron(THREADS_POST_CRON, { timezone: TIMEZONE }, () =>
    runJob("threads_post", 6)
  );
} else {
  console.log(
    "Threads not configured (THREADS_USER_ID / THREADS_ACCESS_TOKEN) - skipping Threads job"
  );
}

console.log(
  `klaps-radar scheduler started (ig-post: "${POST_CRON}", ig-story: "${STORY_CRON}", fb-post: "${FB_POST_CRON}", fb-story: "${FB_STORY_CRON}", threads: "${THREADS_POST_CRON}", tz: ${TIMEZONE})`
);
