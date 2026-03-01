import { fetchInstagramCandidate } from "../../utils/instagram";
import {
  buildInstagramStoryPayloadFromCandidate,
  generateAndSaveInstagramStoryImage,
} from "../../render/platforms/instagram-story";
import { resolveCandidateApiEnv } from "../../utils/environment";

const run = async (): Promise<void> => {
  const outputPath = Bun.argv[2]?.trim() || "preview-story.jpg";
  const candidateDate = Bun.argv[3]?.trim();

  const { apiUrl, internalApiKey } = resolveCandidateApiEnv();
  const candidate = await fetchInstagramCandidate({
    apiUrl,
    internalApiKey,
    date: candidateDate,
  });

  console.log(
    `Candidate: publish=${candidate.publish}, reason=${
      candidate.reason
    }, score=${candidate.score ?? "n/a"}`
  );

  if (!candidate.publish) {
    console.log("Candidate marked as publish=false. Nothing to render.");
    return;
  }

  const payload = buildInstagramStoryPayloadFromCandidate(candidate);
  await generateAndSaveInstagramStoryImage(payload, outputPath);

  console.log(`Rendered story image saved to ${outputPath}`);
};

run().catch((error: unknown) => {
  console.error("Instagram story render failed:", error);
  process.exit(1);
});
