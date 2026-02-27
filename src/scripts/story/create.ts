import { createScreeningStory } from "../../workflows/create-screening-story";

const candidateDate = Bun.argv[2]?.trim();

createScreeningStory(candidateDate).catch((error: unknown) => {
  console.error("Failed to create screening story:", error);
  process.exit(1);
});
