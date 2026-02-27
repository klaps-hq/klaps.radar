export type InstagramMediaItem = {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  permalink?: string;
  timestamp: string;
};

export type InstagramConnectionConfig = {
  accessToken: string;
  instagramUserId: string;
};

export type CreateInstagramPostDraftConfig = InstagramConnectionConfig & {
  imageUrl: string;
  caption: string;
};

export type PublishInstagramPostDraftConfig = InstagramConnectionConfig & {
  creationId: string;
};

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

export type InstagramCandidatePostDraft = {
  imageUrl: string;
  caption: string;
};

export type InstagramCandidateStoryDraft = {
  imageUrl: string;
};

export type FetchInstagramCandidateConfig = {
  apiUrl: string;
  internalApiKey: string;
  date?: string;
};
