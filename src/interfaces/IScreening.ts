export interface Movie {
  id: string;
  title: string;
  description: string;
  posterUrl: string;
  releaseDate: string;
  runtime: number;
  genre: string;
  director: string;
  actors: string[];
}

export interface ScreeningMovieGenre {
  id: number;
  movieId: number;
  genreId: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScreeningMovie {
  id: number;
  sourceId: number;
  slug: string;
  url: string;
  title: string;
  titleOriginal: string;
  description: string;
  productionYear: number;
  worldPremiereDate: string;
  polishPremiereDate: string;
  usersRating: number;
  usersRatingVotes: number;
  criticsRating: number;
  criticsRatingVotes: number;
  language: string;
  duration: number;
  posterUrl: string;
  backdropUrl: string;
  videoUrl: string;
  boxoffice: number | null;
  budget: number | null;
  distribution: string | null;
  createdAt: string;
  updatedAt: string;
  movies_genres: ScreeningMovieGenre[];
}

export interface ScreeningCity {
  id: number;
  sourceId: number;
  slug: string;
  name: string;
  nameDeclinated: string;
  areacode: number;
}

export interface ScreeningCinema {
  id: number;
  sourceId: number;
  slug: string;
  name: string;
  url: string;
  sourceCityId: number;
  longitude: number;
  latitude: number;
  street: string;
  createdAt: string;
  updatedAt: string;
  city: ScreeningCity;
}

export interface Screening {
  id: number;
  url: string;
  movieId: number;
  showtimeId: number;
  cinemaId: number;
  type: string;
  date: string;
  isDubbing: boolean;
  isSubtitled: boolean;
  createdAt: string;
  updatedAt: string;
  movie: ScreeningMovie;
  cinema: ScreeningCinema;
}
