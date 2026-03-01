import type { InstagramCandidateResponse } from "../../types/instagram.types";
import { INSTAGRAM_POST } from "../../constants";
import { renderTemplate, saveTemplateImage } from "../templates";

export type InstagramFeedPostTemplatePayload = {
  movie: NonNullable<InstagramCandidateResponse["movie"]>;
  screening: NonNullable<InstagramCandidateResponse["screening"]>;
};

export type RenderInstagramPostOptions = {
  renderStudioUrl?: string;
  timeoutMs?: number;
};

export const buildInstagramFeedPostPayloadFromCandidate = (
  candidate: InstagramCandidateResponse
): InstagramFeedPostTemplatePayload => {
  if (!candidate.movie || !candidate.screening) {
    throw new Error("Candidate payload is missing movie or screening details.");
  }

  return {
    movie: candidate.movie,
    screening: candidate.screening,
  };
};

export const renderInstagramFeedPostImage = async (
  payload: InstagramFeedPostTemplatePayload,
  options?: RenderInstagramPostOptions
): Promise<Buffer> =>
  renderTemplate(INSTAGRAM_POST.TEMPLATE_KEY, payload, {
    renderStudioUrl: options?.renderStudioUrl,
    timeoutMs: options?.timeoutMs,
  });

export const generateAndSaveInstagramFeedPostImage = async (
  payload: InstagramFeedPostTemplatePayload,
  outputPath: string,
  options?: RenderInstagramPostOptions
): Promise<void> =>
  saveTemplateImage(INSTAGRAM_POST.TEMPLATE_KEY, payload, outputPath, {
    renderStudioUrl: options?.renderStudioUrl,
    timeoutMs: options?.timeoutMs,
  });
