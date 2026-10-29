import { isFacebookConfigured } from "./facebook";
import { reelRange, type ReelKind } from "./reels";
import { isThreadsConfigured } from "./threads";
import type { Platform } from "./types/types";
import { addDays } from "./utils/format";

// The social publishing schedule, shared by the scheduler (src/scripts/
// cron.ts) and the planner (src/plan.ts), so the calendar in the admin panel
// always shows the slots that will actually fire.
export const TIMEZONE = "Europe/Warsaw";

// How many story slots per day the candidate API should allow. Must match
// the number of firing times in the story cron expressions.
export const STORIES_PER_DAY = parseInt(process.env.STORIES_PER_DAY || "2", 10);

export type SocialJob = {
  platform: Platform;
  // Label of the slot in the admin panel calendar.
  format: string;
  cron: string;
  // Candidate range: from the publish day to this many days ahead.
  daysAhead: number;
  maxPosts?: number;
  reelKind?: ReelKind;
  enabled: () => boolean;
};

const always = () => true;

// Posts are staggered across platforms so followers who track us in more
// than one place do not see the same artwork three times in a row; stories
// run two slots (morning commute, after work) within a single expression.
// The Instagram feed gets one item a day in rotating formats: image posts
// late morning (Mon, Fri, Sun), reels in the evening (Tue, Thu, Sat) and
// the weekly line-up carousel on Wednesday, ahead of the weekend.
// Reel series: "Klasyka tygodnia" on Tuesday, "Weekend w kinie" on
// Thursday, "Seans na niedzielę" on Saturday (src/reels.ts), plus the yearly
// "Halloween w kinie" on 30 October.
export const SOCIAL_JOBS: SocialJob[] = [
  { platform: "instagram_post", format: "Post IG", cron: process.env.IG_POST_CRON || "30 11 * * 0,1,5", daysAhead: 6, enabled: always },
  { platform: "instagram_reel", format: "Reel · Klasyka tygodnia", cron: process.env.IG_REEL_CLASSIC_CRON || "30 18 * * 2", daysAhead: 0, reelKind: "classic", enabled: always },
  { platform: "instagram_reel", format: "Reel · Weekend w kinie", cron: process.env.IG_REEL_WEEKEND_CRON || "30 18 * * 4", daysAhead: 0, reelKind: "weekend", enabled: always },
  { platform: "instagram_reel", format: "Reel · Seans na niedzielę", cron: process.env.IG_REEL_SUNDAY_CRON || "30 18 * * 6", daysAhead: 0, reelKind: "sunday", enabled: always },
  // Once a year on 30 October: horror screenings on Halloween and 1 November.
  // maxPosts 2, since Thursday's weekend reel may already cover that range.
  { platform: "instagram_reel", format: "Reel · Halloween w kinie", cron: process.env.IG_REEL_HALLOWEEN_CRON || "30 18 30 10 *", daysAhead: 0, maxPosts: 2, reelKind: "halloween", enabled: always },
  { platform: "instagram_carousel", format: "Karuzela · line-up tygodnia", cron: process.env.IG_CAROUSEL_CRON || "30 11 * * 3", daysAhead: 6, enabled: always },
  { platform: "instagram_story", format: "Relacja IG", cron: process.env.IG_STORY_CRON || "30 8,17 * * *", daysAhead: 1, maxPosts: STORIES_PER_DAY, enabled: always },
  { platform: "facebook_post", format: "Post FB", cron: process.env.FB_POST_CRON || "0 13 * * *", daysAhead: 6, enabled: isFacebookConfigured },
  { platform: "facebook_story", format: "Relacja FB", cron: process.env.FB_STORY_CRON || "45 8,17 * * *", daysAhead: 1, maxPosts: STORIES_PER_DAY, enabled: isFacebookConfigured },
  { platform: "threads_post", format: "Threads", cron: process.env.THREADS_POST_CRON || "30 18 * * *", daysAhead: 6, enabled: isThreadsConfigured },
];

/** Candidate range of a job published on `day` (YYYY-MM-DD, Poland). */
export const jobRange = (job: SocialJob, day: string) =>
  job.reelKind ? reelRange(job.reelKind, day) : { dateFrom: day, dateTo: addDays(day, job.daysAhead) };

/** Stable id of a slot, shared by the planner and the publish run. */
export const slotKey = (job: SocialJob, at: Date): string => {
  const minute = new Date(Math.floor(at.getTime() / 60_000) * 60_000);
  return `${minute.toISOString()}|${job.platform}|${job.format}`;
};

/** Calendar day in Poland of a moment. */
export const polishDay = (at: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(at);
