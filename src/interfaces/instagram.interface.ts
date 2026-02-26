import type { InstagramMediaItem } from "../types/instagram.types";

export interface InstagramApiError {
  message: string;
  type: string;
  code: number;
}

export interface InstagramMediaResponse {
  data?: InstagramMediaItem[];
  error?: InstagramApiError;
}
