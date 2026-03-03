import type { Screening } from "../interfaces";

export type FetchCandidateConfig = {
  dateFrom?: string;
  dateTo?: string;
  platform: "instagram_post" | "instagram_story";
  minScore?: number;
  numberOfCandidates?: number;
};

export type FetchCandidateResponse = {
  publish: boolean;
  date: {
    from: string;
    to: string;
  };
  reason:
    | "HAS_HIGH_QUALITY_CANDIDATE"
    | "NO_HIGH_QUALITY_CANDIDATE"
    | "NO_SCREENINGS_IN_RANGE"
    | "ALREADY_PUBLISHED";
  meta: {
    candidatesChecked: number;
    bestScore: number | null;
    minScore: number;
  };
  candidates: Screening[];
};
