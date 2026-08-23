/** Pays public — `GET /v3/country/get-countries` / `Country` de get-auth */
export interface ICountry {
  id: string;
  pubicName: string;
  name: string;
  shedule?: IShedule;
}

export type AuthCountry = ICountry;

export interface IRate {
  taux: string;
}

export type RateResponse = IRate;

export interface IShedule {
  /** 1 = lundi … 7 = dimanche */
  workingDate: number[];
  workingFrom: number;
  workingTo: number;
}

export interface IDirection {
  code: string;
  fee: number;
  min: number;
  max: number;
  countryTo: {
    name: string;
    formatNumber: string;
    TelMaxNumber: number;
  };
}

export type Direction = IDirection;
