export type InstagramCandidateReason =
  | "HIGH_QUALITY_CANDIDATE"
  | "NO_HIGH_QUALITY_CANDIDATE"
  | string;

export type InstagramCandidateGenre = {
  id: number;
  slug: string;
  name: string;
};

export type InstagramCandidateMovie = {
  id: number;
  slug: string;
  title: string;
  titleOriginal?: string;
  productionYear: number;
  duration: number;
  posterUrl?: string;
  genres: InstagramCandidateGenre[];
  description: string;
  backdropUrl?: string;
};

export type InstagramCandidateCity = {
  id: number;
  slug: string;
  name: string;
  nameDeclinated?: string;
};

export type InstagramCandidateCinema = {
  id: number;
  slug: string;
  name: string;
  street: string;
  city: InstagramCandidateCity;
};

export type InstagramCandidateScreening = {
  id: number;
  date: string;
  time: string;
  dateTime: string;
  ticketUrl: string;
  isDubbing: boolean;
  isSubtitled: boolean;
  cinema: InstagramCandidateCinema;
};

export type InstagramCandidateMeta = {
  candidatesChecked?: number;
  bestScore?: number;
  minScore?: number;
};

export type InstagramCandidateResponse = {
  publish: boolean;
  date: string;
  score?: number;
  reason: InstagramCandidateReason;
  movie?: InstagramCandidateMovie;
  screening?: InstagramCandidateScreening;
  meta?: InstagramCandidateMeta;
};

export type FetchInstagramCandidateConfig = {
  apiUrl: string;
  internalApiKey: string;
  date?: string;
  platform: "INSTAGRAM" | "FACEBOOK" | "X" | "THREADS";
  minScore?: number;
};
