export type Platform =
  | "instagram_post"
  | "instagram_story"
  | "facebook_post"
  | "facebook_story"
  | "threads_post";

export type ScreeningCity = {
  name: string;
  voivodeship: string | null;
};

export type ScreeningCinema = {
  name: string;
  street: string;
  city: ScreeningCity;
};

export type ScreeningMovie = {
  title: string;
  description: string | null;
  productionYear: number;
  duration: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
};

// Shape of /socials/candidate items: a raw screenings row with joined
// movie and cinema(+city). `date` is a full ISO timestamp (no separate
// `time` column) and genres come only as ids, so they are not used here.
export type Screening = {
  id: number;
  date: string;
  movie: ScreeningMovie;
  cinema: ScreeningCinema;
};

export type FetchCandidateConfig = {
  dateFrom?: string;
  dateTo?: string;
  platform: Platform;
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
