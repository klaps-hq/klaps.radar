import { createScreeningStory } from "./create-screening-story";
import { startScheduledJob } from "../utils/scheduler";

export const scheduleScreeningStory = (): void => {
  const schedule = process.env.SCREENING_STORY_CRON ?? "30 9 * * *";
  const timezone = process.env.SCREENING_STORY_TIMEZONE ?? "Europe/Warsaw";

  startScheduledJob("screening story", schedule, timezone, async () => {
    await createScreeningStory();
  });
};
