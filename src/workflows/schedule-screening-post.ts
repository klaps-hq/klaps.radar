import { createScreeningPost } from "./create-screening-post";
import { startScheduledJob } from "../utils/scheduler";

export const scheduleScreeningPost = (): void => {
  const schedule = process.env.SCREENING_POST_CRON ?? "0 9 * * *";
  const timezone = process.env.SCREENING_POST_TIMEZONE ?? "Europe/Warsaw";

  startScheduledJob("screening post", schedule, timezone, async () => {
    await createScreeningPost();
  });
};
