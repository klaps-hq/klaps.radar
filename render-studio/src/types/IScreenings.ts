import type { ICinemaSummary } from "./ICinema";
import type { IMovie, IMovieSummary } from "./IMovies";

export interface IScreening {
  id: number;
  date: string;
  time: string;
  dateTime: string;
  ticketUrl: string | null;
  isDubbing: boolean;
  isSubtitled: boolean;
  cinema: ICinemaSummary;
  movie: IMovieSummary;
}

export interface IScreeningGroup {
  movie: IMovieSummary;
  summary: {
    screeningsCount: number;
    cinemasCount: number;
    citiesCount: number;
    cities: string[];
  };
  screenings: IScreening[];
}

export interface IScreeningDetail {
  movie: IMovie;
  screening: IScreening;
}

export interface IRandomScreening {
  movie: IMovie;
  screening: IScreening;
}
