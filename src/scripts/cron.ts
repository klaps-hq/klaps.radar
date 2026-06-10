import { Cron } from "croner";
import { setTimeout as sleep } from "node:timers/promises";
import { isFacebookConfigured } from "../facebook";
import { createSocialMedia } from "../publish";
import { isThreadsConfigured } from "../threads";
import type { Platform } from "../types/types";
import { addDays, todayInPoland } from "../utils/format";

// Long-running container entrypoint: schedules the publishing jobs
// in-process, so the deployment needs nothing beyond this container.
const TIMEZONE = "Europe/Warsaw";

// Posts are staggered across platforms so followers who track us in more
// than one place do not see the same artwork three times in a row; stories
// run two slots (morning commute, after work) within a single expression.
const POST_CRON = process.env.IG_POST_CRON || "30 11 * * *";
const STORY_CRON = process.env.IG_STORY_CRON || "30 8,17 * * *";
const FB_POST_CRON = process.env.FB_POST_CRON || "0 13 * * *";
const FB_STORY_CRON = process.env.FB_STORY_CRON || "45 8,17 * * *";
const THREADS_POST_CRON = process.env.THREADS_POST_CRON || "30 18 * * *";

// How many story slots per day the candidate API should allow. Must match
// the number of firing times in the story cron expressions.
const STORIES_PER_DAY = parseInt(process.env.STORIES_PER_DAY || "2", 10);

// Optional random delay (0..N minutes) before each job so publications do
// not land at the exact same minute every day.
const JITTER_MINUTES = parseInt(process.env.PUBLISH_JITTER_MINUTES || "0", 10);

const runJob = async (
  platform: Platform,
  daysAhead: number,
  maxPosts?: number
) => {
  if (JITTER_MINUTES > 0) {
    const delayMs = Math.floor(Math.random() * JITTER_MINUTES * 60_000);
    console.log(
      `[${platform}] jitter: delaying ${Math.round(delayMs / 1000)}s`
    );
    await sleep(delayMs);
  }

  const dateFrom = todayInPoland();
  const dateTo = addDays(dateFrom, daysAhead);

  console.log(`[${platform}] run for ${dateFrom}..${dateTo}`);

  try {
    await createSocialMedia(platform, {
      dateFrom,
      dateTo,
      minScore: 30,
      numberOfCandidates: 30,
      maxPosts,
    });
  } catch (error) {
    // Never crash the scheduler - a failed day is just a skipped day.
    console.error(`[${platform}] failed:`, error);
  }
};

new Cron(POST_CRON, { timezone: TIMEZONE }, () => runJob("instagram_post", 6));
new Cron(STORY_CRON, { timezone: TIMEZONE }, () =>
  runJob("instagram_story", 1, STORIES_PER_DAY)
);

if (isFacebookConfigured()) {
  new Cron(FB_POST_CRON, { timezone: TIMEZONE }, () =>
    runJob("facebook_post", 6)
  );
  new Cron(FB_STORY_CRON, { timezone: TIMEZONE }, () =>
    runJob("facebook_story", 1, STORIES_PER_DAY)
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
  `klaps-radar scheduler started (ig-post: "${POST_CRON}", ig-story: "${STORY_CRON}", fb-post: "${FB_POST_CRON}", fb-story: "${FB_STORY_CRON}", threads: "${THREADS_POST_CRON}", stories/day: ${STORIES_PER_DAY}, jitter: ${JITTER_MINUTES}m, tz: ${TIMEZONE})`
);
