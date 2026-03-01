import type { InstagramCandidateResponse } from "../../types/instagram.types";
import { INSTAGRAM_STORY } from "../../constants";
import { renderTemplate, saveTemplateImage } from "../templates";

export type InstagramStoryTemplatePayload = {
  movie: NonNullable<InstagramCandidateResponse["movie"]>;
  screening: NonNullable<InstagramCandidateResponse["screening"]>;
};

export type RenderInstagramStoryOptions = {
  renderStudioUrl?: string;
  timeoutMs?: number;
};

export const buildInstagramStoryPayloadFromCandidate = (
  candidate: InstagramCandidateResponse
): InstagramStoryTemplatePayload => {
  if (!candidate.movie || !candidate.screening) {
    throw new Error("Candidate payload is missing movie or screening details.");
  }

  return {
    movie: candidate.movie,
    screening: candidate.screening,
  };
};

export const renderInstagramStoryImage = async (
  payload: InstagramStoryTemplatePayload,
  options?: RenderInstagramStoryOptions
): Promise<Buffer> =>
  renderTemplate(INSTAGRAM_STORY.TEMPLATE_KEY, payload, {
    renderStudioUrl: options?.renderStudioUrl,
    timeoutMs: options?.timeoutMs,
  });

export const generateAndSaveInstagramStoryImage = async (
  payload: InstagramStoryTemplatePayload,
  outputPath: string,
  options?: RenderInstagramStoryOptions
): Promise<void> =>
  saveTemplateImage(INSTAGRAM_STORY.TEMPLATE_KEY, payload, outputPath, {
    renderStudioUrl: options?.renderStudioUrl,
    timeoutMs: options?.timeoutMs,
  });
