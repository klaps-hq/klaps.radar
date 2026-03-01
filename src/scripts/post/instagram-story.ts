import {
  fetchInstagramCandidate,
  publishInstagramStory,
} from "../../utils/instagram";
import { createPublicPostImageUrl } from "../../render/post-image";
import {
  resolveCandidateApiEnv,
  resolveInstagramEnv,
} from "../../utils/environment";
import { buildInstagramStoryPayloadFromCandidate } from "../../render/platforms/instagram-story";
import { INSTAGRAM_STORY } from "../../constants";

const run = async (): Promise<void> => {
  const candidateDate = Bun.argv[2]?.trim();
  const { apiUrl, internalApiKey } = resolveCandidateApiEnv();
  const { accessToken, instagramUserId } = resolveInstagramEnv();

  const candidate = await fetchInstagramCandidate({
    apiUrl,
    internalApiKey,
    date: candidateDate,
    minScore: 20,
  });

  console.log(
    `Candidate: publish=${candidate.publish}, reason=${
      candidate.reason
    }, score=${candidate.score ?? "n/a"}`
  );

  if (!candidate.publish || !candidate.movie || !candidate.screening) {
    console.log("No publishable candidate. Nothing was posted.");
    return;
  }

  const payload = buildInstagramStoryPayloadFromCandidate(candidate);
  const imageUrl = await createPublicPostImageUrl({
    templateId: INSTAGRAM_STORY.TEMPLATE_KEY,
    payload,
  });

  const publishResult = await publishInstagramStory({
    instagramUserId,
    accessToken,
    imageUrl,
  });

  console.log(`Uploaded image URL: ${imageUrl}`);
  console.log(
    `Instagram story published. creationId=${publishResult.creationId}, mediaId=${publishResult.mediaId}`
  );
};

run().catch((error: unknown) => {
  console.error("Instagram story publish failed:", error);
  process.exit(1);
});
