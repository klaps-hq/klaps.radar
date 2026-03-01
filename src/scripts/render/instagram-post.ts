import { fetchInstagramCandidate } from "../../utils/instagram";
import {
  buildInstagramFeedPostPayloadFromCandidate,
  generateAndSaveInstagramFeedPostImage,
} from "../../render-instagram-post";
import { resolveCandidateApiEnv } from "../../utils/environment";

const run = async (): Promise<void> => {
  const outputPath = Bun.argv[2]?.trim() || "preview-post.jpg";
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

  const payload = buildInstagramFeedPostPayloadFromCandidate(candidate);
  await generateAndSaveInstagramFeedPostImage(payload, outputPath);

  console.log(`Rendered image saved to ${outputPath}`);
};

run().catch((error: unknown) => {
  console.error("Instagram post render failed:", error);
  process.exit(1);
});
