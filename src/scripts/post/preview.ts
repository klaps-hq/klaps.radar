import { previewScreeningPost } from "../../workflows/preview-screening-post";

const candidateDate = Bun.argv[2]?.trim();

previewScreeningPost(candidateDate).catch((error: unknown) => {
  console.error("Preview post error:", error);
  process.exit(1);
});
