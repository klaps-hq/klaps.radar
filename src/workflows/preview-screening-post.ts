import { buildCaptionFromCandidate, fetchInstagramCandidate } from "../instagram";
import { generateAndSavePostImage } from "../post-image";
import { resolveCandidateApiEnv } from "../utils/environment";

const PREVIEW_POST_IMAGE_PATH = "preview-post.jpg";

export const previewScreeningPost = async (
  candidateDate?: string
): Promise<void> => {
  const { apiUrl, internalApiKey } = resolveCandidateApiEnv();

  const candidate = await fetchInstagramCandidate({
    apiUrl,
    internalApiKey,
    date: candidateDate,
  });

  console.log(
    `publish=${candidate.publish}, reason=${candidate.reason}, score=${candidate.score ?? "n/a"}\n`
  );

  if (!candidate.publish || !candidate.movie || !candidate.screening) {
    console.log("Candidate marked as publish=false. Nothing to preview.");
    return;
  }

  const posterUrl = candidate.movie.posterUrl ?? candidate.movie.backdropUrl;
  if (!posterUrl) {
    console.log("Candidate is missing posterUrl and backdropUrl.");
    return;
  }

  await generateAndSavePostImage(
    { posterUrl, backdropUrl: candidate.movie.backdropUrl, layout: "post" },
    PREVIEW_POST_IMAGE_PATH
  );

  const caption = buildCaptionFromCandidate(candidate);

  console.log(`=== IMAGE saved to ${PREVIEW_POST_IMAGE_PATH} ===`);
  console.log(`\n=== CAPTION ===`);
  console.log(caption);
};
