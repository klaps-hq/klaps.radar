import { createScreeningPost } from "./workflows/create-screening-post";

const run = async (): Promise<void> => {
  const candidateDate = Bun.argv[2]?.trim();
  await createScreeningPost(candidateDate);
};

run().catch((error: unknown) => {
  console.error("Instagram integration error:", error);
});
