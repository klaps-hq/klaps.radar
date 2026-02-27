import cron from "node-cron";

export const startScheduledJob = (
  label: string,
  schedule: string,
  timezone: string,
  job: () => Promise<void>
): void => {
  if (!cron.validate(schedule)) {
    throw new Error(
      `Invalid ${label} cron value: "${schedule}". Example: "0 9 * * *".`
    );
  }

  console.log(
    `${label} scheduler started. Cron: "${schedule}", timezone: "${timezone}".`
  );

  cron.schedule(
    schedule,
    async () => {
      const startedAt = new Date().toISOString();
      console.log(`[${startedAt}] Running ${label} job...`);
      try {
        await job();
        console.log(`[${new Date().toISOString()}] ${label} job finished.`);
      } catch (error: unknown) {
        console.error(`[${new Date().toISOString()}] ${label} job failed:`, error);
      }
    },
    { timezone }
  );
};
