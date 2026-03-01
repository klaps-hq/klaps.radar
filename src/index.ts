import {
  buildCaptionFromCandidate,
  buildStoryInfoFromCandidate,
  fetchInstagramCandidate,
} from "./instagram";
import { resolveCandidateApiEnv } from "./utils/environment";

const run = async (): Promise<void> => {
  const candidateDate = Bun.argv[2]?.trim();
  const { apiUrl, internalApiKey } = resolveCandidateApiEnv();
  const candidate = await fetchInstagramCandidate({
    apiUrl,
    internalApiKey,
    date: candidateDate,
  });

  console.log(
    `Candidate: publish=${candidate.publish}, reason=${candidate.reason}, score=${candidate.score ?? "n/a"}`
  );

  if (!candidate.publish || !candidate.movie || !candidate.screening) {
    console.log("No publishable candidate. Description was not generated.");
    return;
  }

  const caption = buildCaptionFromCandidate(candidate);
  const storyInfo = buildStoryInfoFromCandidate(candidate);

  console.log("\n=== POST CAPTION ===\n");
  console.log(caption);

  console.log("\n=== STORY INFO ===\n");
  console.log(`Title: ${storyInfo.title}`);
  console.log(storyInfo.facts.join("\n"));
};

run().catch((error: unknown) => {
  console.error("Instagram integration error:", error);
});
