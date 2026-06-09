import type {
  FetchCandidateConfig,
  FetchCandidateResponse,
  Platform,
} from "../types/types";
import { API_URL, INTERNAL_API_KEY } from "../constants/env";

export const fetchCandidate = async (
  config: FetchCandidateConfig
): Promise<FetchCandidateResponse> => {
  const params = new URLSearchParams();

  if (config.dateFrom) params.set("dateFrom", config.dateFrom);
  if (config.dateTo) params.set("dateTo", config.dateTo);
  if (config.platform) params.set("platform", config.platform);

  if (config.minScore !== undefined) {
    params.set("minScore", String(config.minScore));
  }

  if (config.numberOfCandidates !== undefined) {
    params.set("numberOfCandidates", String(config.numberOfCandidates));
  }

  const url = `${API_URL}/socials/candidate?${params.toString()}`;

  if (!INTERNAL_API_KEY) {
    throw new Error("INTERNAL_API_KEY is not set");
  }

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": INTERNAL_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.json();

    throw new Error(`Failed to fetch candidate: ${error.message}`);
  }

  return response.json();
};

const socialsAction = async (
  action: "reserve" | "publish",
  screeningId: number,
  platform: Platform
) => {
  if (!INTERNAL_API_KEY) {
    throw new Error("INTERNAL_API_KEY is not set");
  }

  const response = await fetch(`${API_URL}/socials/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": INTERNAL_API_KEY,
    },
    body: JSON.stringify({
      screeningId,
      platform,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to ${action} candidate: ${error.message ?? response.statusText}`
    );
  }
};

// Creates the socials_posts row (published: false). Acts as a lock: once a
// candidate is reserved, the candidate endpoint reports ALREADY_PUBLISHED
// for that date range, so a re-run cannot post the same screening twice.
export const reserveCandidate = (screeningId: number, platform: Platform) =>
  socialsAction("reserve", screeningId, platform);

export const markCandidateAsPublished = (
  screeningId: number,
  platform: Platform
) => socialsAction("publish", screeningId, platform);
