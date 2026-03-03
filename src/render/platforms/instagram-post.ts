import { INSTAGRAM_API_URL, INSTAGRAM_POST } from "../../constants";
import { INSTAGRAM_ACCESS_TOKEN } from "../../constants/env";
import type { FetchCandidateConfig } from "../../types/types";
import {
  fetchCandidate,
  markCandidateAsPublished,
} from "../../utils/candidate";
import { createPublicPostImageUrl } from "../post-image";

export const uploadInstagramPost = async (imageUrl: string) => {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    throw new Error("INSTAGRAM_ACCESS_TOKEN is not set");
  }

  const response = await fetch(`${INSTAGRAM_API_URL}/media`, {
    method: "POST",
    body: JSON.stringify({
      media_type: "IMAGE",
      media_url: imageUrl,
      caption: "Test caption",
      access_token: INSTAGRAM_ACCESS_TOKEN,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to upload Instagram post: ${error.message}`);
  }

  const data = await response.json();
  return data;
};

export const createInstagramPost = async (payload: FetchCandidateConfig) => {
  const candidates = await fetchCandidate({
    dateFrom: payload.dateFrom,
    dateTo: payload.dateTo,
    minScore: payload.minScore,
    numberOfCandidates: payload.numberOfCandidates,
    platform: "instagram_post",
  });

  const candidate = candidates.candidates[0];

  if (!candidate) {
    throw new Error("No candidate found");
  }

  const imageUrl = await createPublicPostImageUrl({
    templateId: INSTAGRAM_POST.TEMPLATE_KEY,
    payload: {
      movie: candidate.movie,
      screening: candidate,
    },
  });

  await uploadInstagramPost(imageUrl);
  await markCandidateAsPublished(candidate.id, "instagram_post");

  console.log(`Instagram post created: ${imageUrl}`);
};
