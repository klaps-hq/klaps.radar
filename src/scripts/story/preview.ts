import { previewScreeningStory } from "../../workflows/preview-screening-story";

const candidateDate = Bun.argv[2]?.trim();

previewScreeningStory(candidateDate).catch((error: unknown) => {
  console.error("Preview story error:", error);
  process.exit(1);
});
