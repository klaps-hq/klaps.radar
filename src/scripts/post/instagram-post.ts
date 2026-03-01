import {
  buildCaptionFromCandidate,
  fetchInstagramCandidate,
  publishInstagramImagePost,
} from "../../utils/instagram";
import { createPublicPostImageUrl } from "../../render/post-image";
import {
  resolveCandidateApiEnv,
  resolveInstagramEnv,
} from "../../utils/environment";
import { buildInstagramFeedPostPayloadFromCandidate } from "../../render/platforms/instagram";
import { INSTAGRAM_POST } from "../../constants";

const run = async (): Promise<void> => {
  const candidateDate = Bun.argv[2]?.trim();
  const { apiUrl, internalApiKey } = resolveCandidateApiEnv();
  const { accessToken, instagramUserId } = resolveInstagramEnv();

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

  if (!candidate.publish || !candidate.movie || !candidate.screening) {
    console.log("No publishable candidate. Nothing was posted.");
    return;
  }

  const payload = buildInstagramFeedPostPayloadFromCandidate(candidate);
  const imageUrl = await createPublicPostImageUrl({
    templateId: INSTAGRAM_POST.TEMPLATE_KEY,
    payload,
  });

  const caption = buildCaptionFromCandidate(candidate);

  const publishResult = await publishInstagramImagePost({
    instagramUserId,
    accessToken,
    imageUrl,
    caption,
  });

  console.log(`Uploaded image URL: ${imageUrl}`);
  console.log(
    `Instagram post published. creationId=${publishResult.creationId}, mediaId=${publishResult.mediaId}`
  );
};

run().catch((error: unknown) => {
  console.error("Instagram post publish failed:", error);
  process.exit(1);
});
