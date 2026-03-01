import { ICity } from "./ICities";

export interface ICinemaSummary {
  id: number;
  slug: string;
  name: string;
  street: string | null;
  city: ICity;
}

export interface ICinema {
  id: number;
  slug: string;
  name: string;
  street: string | null;
  city: ICity;
  latitude: number | null;
  longitude: number | null;
  sourceUrl: string;
}

export interface ICinemaGroup {
  city: ICity;
  cinemas: Omit<ICinemaSummary, "city">[];
}
