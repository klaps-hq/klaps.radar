export interface IGenre {
  id: number;
  slug: string;
  name: string;
}

export interface IMoviePerson {
  id?: number;
  sourceId?: number;
  name: string;
  url?: string;
}

export interface IMovieCountry {
  id?: number;
  name: string;
  countryCode?: string;
}

export interface IMovieSummary {
  id: number;
  slug: string;
  title: string;
  titleOriginal: string | null;
  productionYear: number;
  duration: number | null;
  posterUrl: string | null;
  genres: IGenre[];
}

export interface IMovieHero extends IMovieSummary {
  description: string | null;
  backdropUrl: string | null;
}

export interface IMovie {
  id: number;
  slug: string;
  title: string;
  titleOriginal: string | null;
  description: string | null;
  productionYear: number;
  duration: number | null;
  language: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  videoUrl: string | null;
  worldPremiereDate: string | null;
  polishPremiereDate: string | null;
  directors?: IMoviePerson[] | null;
  actors?: IMoviePerson[] | null;
  countries?: IMovieCountry[] | null;
  scriptwriters?: IMoviePerson[] | null;
  countryOfOrigin?: IMovieCountry[] | null;
  screenwriters?: IMoviePerson[] | null;
  genres: IGenre[];
  sourceUrl: string;
}

export interface IMultiCityMovie {
  id: number;
  slug: string;
  title: string;
  productionYear: number;
  posterUrl: string | null;
  citiesCount: number;
  description: string | null;
  duration: number | null;
}

export interface PaginatedResponse<T> {
  data: readonly T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
