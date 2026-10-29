import { Cron } from "croner";
import { setTimeout as sleep } from "node:timers/promises";
import { createSocialMedia } from "../publish";
import { runPlanner } from "../plan";
import { jobRange, polishDay, slotKey, SOCIAL_JOBS, STORIES_PER_DAY, TIMEZONE, type SocialJob } from "../schedule";
import { markPlan } from "../utils/plans";

// Long-running container entrypoint: schedules the publishing jobs
// in-process, so the deployment needs nothing beyond this container. The
// schedule itself lives in src/schedule.ts (shared with the planner).

// Optional random delay (0..N minutes) before each job so publications do
// not land at the exact same minute every day.
const JITTER_MINUTES = parseInt(process.env.PUBLISH_JITTER_MINUTES || "0", 10);

// Planned posts for the admin panel: refreshed on startup, every two hours
// and shortly after each publish run (the published slot leaves the plan
// and later slots may pick differently).
const PLANNER_CRON = process.env.PLANNER_CRON || "15 */2 * * *";
const REPLAN_DELAY_MS = 60_000;
let replanTimer: ReturnType<typeof setTimeout> | undefined;
const scheduleReplan = () => {
  clearTimeout(replanTimer);
  replanTimer = setTimeout(() => void runPlanner(), REPLAN_DELAY_MS);
};

const runJob = async (job: SocialJob, firedAt: Date) => {
  const { platform } = job;
  const key = slotKey(job, firedAt);

  if (JITTER_MINUTES > 0) {
    const delayMs = Math.floor(Math.random() * JITTER_MINUTES * 60_000);
    console.log(
      `[${platform}] jitter: delaying ${Math.round(delayMs / 1000)}s`
    );
    await sleep(delayMs);
  }

  const { dateFrom, dateTo } = jobRange(job, polishDay(firedAt));

  console.log(`[${platform}] run for ${dateFrom}..${dateTo}`);

  try {
    const result = await createSocialMedia(platform, {
      dateFrom,
      dateTo,
      minScore: 30,
      numberOfCandidates: 30,
      maxPosts: job.maxPosts,
      reelKind: job.reelKind,
    });
    await markPlan(
      result
        ? { slotKey: key, status: "published", externalId: result.mediaId }
        : { slotKey: key, status: "skipped", reason: "no candidate at publish time" }
    );
  } catch (error) {
    // Never crash the scheduler - a failed day is just a skipped day.
    console.error(`[${platform}] failed:`, error);
    await markPlan({ slotKey: key, status: "failed", reason: error instanceof Error ? error.message.slice(0, 400) : "error" });
  } finally {
    scheduleReplan();
  }
};

for (const job of SOCIAL_JOBS) {
  if (!job.enabled()) {
    console.log(`${job.format}: platform not configured - skipping`);
    continue;
  }
  new Cron(job.cron, { timezone: TIMEZONE }, () => runJob(job, new Date()));
}

new Cron(PLANNER_CRON, { timezone: TIMEZONE }, () => runPlanner());
void runPlanner();

console.log(
  `klaps-radar scheduler started (${SOCIAL_JOBS.filter((j) => j.enabled())
    .map((j) => `${j.format}: "${j.cron}"`)
    .join(", ")}, stories/day: ${STORIES_PER_DAY}, planner: "${PLANNER_CRON}", jitter: ${JITTER_MINUTES}m, tz: ${TIMEZONE})`
);
