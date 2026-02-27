import {
  createInstagramStoryDraft,
  fetchInstagramCandidate,
  mapCandidateToInstagramStoryDraft,
  publishInstagramPostDraft,
} from "../instagram";
import { resolveCandidateApiEnv, resolveInstagramEnv } from "../utils/environment";

export const createScreeningStory = async (
  candidateDate?: string
): Promise<void> => {
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
    console.log("Candidate marked as publish=false. Nothing to post as story.");
    return;
  }

  const storyDraft = await mapCandidateToInstagramStoryDraft(candidate);

  console.log(`Story image URL: ${storyDraft.imageUrl}`);

  const creationId = await createInstagramStoryDraft({
    accessToken,
    instagramUserId,
    imageUrl: storyDraft.imageUrl,
  });

  console.log(`Story draft created. Creation ID: ${creationId}. Publishing...`);

  const publishedStoryId = await publishInstagramPostDraft({
    accessToken,
    instagramUserId,
    creationId,
  });

  console.log(`Story published successfully. Story ID: ${publishedStoryId}.`);
};
