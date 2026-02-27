import type {
  InstagramCandidateResponse,
  InstagramMediaItem,
} from "../types/instagram.types";

export interface InstagramApiError {
  message: string;
  type: string;
  code: number;
}

export interface InstagramMediaResponse {
  data?: InstagramMediaItem[];
  error?: InstagramApiError;
}

export interface InstagramMediaCreationResponse {
  id?: string;
  error?: InstagramApiError;
}

export interface InstagramMediaContainerStatusResponse {
  status_code?: string;
  error?: InstagramApiError;
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
