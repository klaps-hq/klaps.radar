import { Cron } from "croner";
import {
  movieKey,
  prepareSocialMedia,
  renderSocialMedia,
} from "./publish";
import {
  jobRange,
  polishDay,
  slotKey,
  SOCIAL_JOBS,
  TIMEZONE,
  type SocialJob,
} from "./schedule";
import type { Platform } from "./types/types";
import { FEED_PLATFORMS } from "./utils/feed-history";
import { putPlans, uploadPlanMedia, type PlanInput } from "./utils/plans";

// Planned posts for the admin panel calendar. The slots come from the same
// schedule as the publish jobs; the first PREPARE_DAYS are prepared with the
// publishing code itself (candidate, art pick, render, caption - reels as a
// still frame), so the panel shows exactly what will go out. Art picks are
// cached per movie, so planning ahead does not add Gemini calls: the publish
// run reuses the same pick.
const PREPARE_DAYS = 3;
const CALENDAR_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Instagram feed formats share one profile grid, so a movie planned for one
// is not repeated in another (mirrors the API cooldown group).
const cooldownGroup = (p: Platform): Platform[] => (FEED_PLATFORMS.includes(p) ? FEED_PLATFORMS : [p]);

type Slot = { job: SocialJob; at: Date };

const upcomingSlots = (from: Date, to: Date): Slot[] =>
  SOCIAL_JOBS.filter((job) => job.enabled())
    .flatMap((job) =>
      new Cron(job.cron, { timezone: TIMEZONE, paused: true })
        .nextRuns(64, from)
        .filter((at) => at <= to)
        .map((at) => ({ job, at }))
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime());

let running = false;

export const runPlanner = async (): Promise<void> => {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    const now = new Date();
    const prepareUntil = new Date(now.getTime() + PREPARE_DAYS * DAY_MS);
    const until = new Date(now.getTime() + CALENDAR_DAYS * DAY_MS);

    // Picks made earlier in this plan: the API only knows published posts,
    // so the plan applies the daily limit and the cooldown itself.
    // `movies` is everything a slot shows (a whole line-up), for the cooldown.
    const picks: { platform: Platform; movies: string[]; publishDay: string }[] = [];
    const plans: PlanInput[] = [];
    const media = new Map<string, Buffer[]>();

    for (const { job, at } of upcomingSlots(now, until)) {
      const base = {
        slotKey: slotKey(job, at),
        slotAt: at.toISOString(),
        platform: job.platform,
        format: job.format,
        screeningIds: [] as number[],
      };
      if (at > prepareUntil) {
        plans.push({ ...base, status: "pending" });
        continue;
      }

      // Same daily limit as the API: posts of the platform published on the
      // slot's day (the API counts real posts, the plan its earlier picks).
      const publishDay = polishDay(at);
      const range = jobRange(job, publishDay);
      const sameDay = picks.filter((p) => p.platform === job.platform && p.publishDay === publishDay).length;
      if (sameDay >= (job.maxPosts ?? 1)) {
        plans.push({ ...base, status: "skipped", reason: "ALREADY_PUBLISHED (daily limit used by earlier slots)" });
        continue;
      }

      const exclude = new Set(
        picks.filter((p) => cooldownGroup(job.platform).includes(p.platform)).flatMap((p) => p.movies)
      );
      try {
        const prepared = await prepareSocialMedia(
          job.platform,
          {
            ...range,
            minScore: 30,
            numberOfCandidates: 30,
            maxPosts: job.maxPosts,
            reelKind: job.reelKind,
            publishDay,
          },
          exclude
        );
        if (!prepared.ok) {
          plans.push({ ...base, status: "skipped", reason: prepared.reason });
          continue;
        }
        const { post } = prepared;
        const rendered = await renderSocialMedia(post, { still: true });
        picks.push({
          platform: job.platform,
          movies: [post.candidate, ...rendered.tagged].map(movieKey),
          publishDay,
        });
        plans.push({
          ...base,
          status: "planned",
          // The reserved screening first, then the rest of a line-up.
          screeningIds: [...new Set([post.candidate.id, ...rendered.tagged.map((s) => s.id)])],
          caption: rendered.caption,
        });
        media.set(base.slotKey, rendered.media.map((m) => m.buffer));
      } catch (error) {
        console.warn(`[planner] ${base.slotKey} failed:`, error instanceof Error ? error.message : error);
        plans.push({ ...base, status: "skipped", reason: "render failed" });
      }
    }

    const ids = await putPlans(now, until, plans);
    for (const [key, buffers] of media) {
      const id = ids.get(key);
      if (!id) continue;
      for (const [position, buffer] of buffers.entries()) await uploadPlanMedia(id, position, buffer);
    }
    console.log(
      `[planner] ${plans.length} slots (${media.size} prepared) in ${Math.round((Date.now() - started) / 1000)}s`
    );
  } catch (error) {
    console.error("[planner] failed:", error);
  } finally {
    running = false;
  }
};
