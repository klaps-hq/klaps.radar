import {
  createInstagramPostDraft,
  fetchInstagramCandidate,
  mapCandidateToInstagramPostDraft,
  publishInstagramPostDraft,
} from "../instagram";
import { resolveCandidateApiEnv, resolveInstagramEnv } from "../utils/environment";

export const createScreeningPost = async (candidateDate?: string): Promise<void> => {
  const { accessToken, instagramUserId } = resolveInstagramEnv();
  const { apiUrl, internalApiKey } = resolveCandidateApiEnv();

  const candidate = await fetchInstagramCandidate({
    apiUrl,
    internalApiKey,
    date: candidateDate,
  });

  console.log(
    `Candidate: publish=${candidate.publish}, reason=${candidate.reason}, score=${candidate.score ?? "n/a"}`
  );

  if (!candidate.publish) {
    console.log("Candidate marked as publish=false. Nothing to post.");
    return;
  }

  const postDraft = await mapCandidateToInstagramPostDraft(candidate);

  console.log(`Image URL: ${postDraft.imageUrl}`);
  console.log(`Caption:\n${postDraft.caption}\n`);

  const creationId = await createInstagramPostDraft({
    accessToken,
    instagramUserId,
    imageUrl: postDraft.imageUrl,
    caption: postDraft.caption,
  });

  console.log(`Draft created. Creation ID: ${creationId}. Publishing...`);

  const publishedPostId = await publishInstagramPostDraft({
    accessToken,
    instagramUserId,
    creationId,
  });

  console.log(`Post published successfully. Post ID: ${publishedPostId}.`);
};
