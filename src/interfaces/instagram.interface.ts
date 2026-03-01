import type { InstagramCandidateResponse } from "../types/instagram.types";

export interface InstagramApiError {
  message: string;
  type: string;
  code: number;
}

export interface InternalApiErrorResponse {
  message?: string;
  error?: string;
  statusCode?: number;
}

export interface InstagramCandidateApiResponse extends InstagramCandidateResponse {
  error?: InternalApiErrorResponse | string;
  message?: string;
}
