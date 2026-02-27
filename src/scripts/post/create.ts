import { createScreeningPost } from "../../workflows/create-screening-post";

const candidateDate = Bun.argv[2]?.trim();

createScreeningPost(candidateDate).catch((error: unknown) => {
  console.error("Failed to create screening post:", error);
  process.exit(1);
});
