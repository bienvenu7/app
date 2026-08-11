/** Champs publics pays (API Août 2026) — pas de solde / admins / Fund / Cost. */
export interface ICountry {
  id: string;
  pubicName: string;
  name: string;
  createdAt?: Date | string;
  currency: string;
  TelIndex: string;
  /** API renvoie un number ; certaines routes historiques envoient une string. */
  TelMaxNumber: number | string;
  formatNumber: string;
  shedule?: IShedule;
}

export interface IRate {
  id: string;
  iltineraire: string;
  code: string;
  Total: string;
  frais: string;
  taux: string;
  intervalMin: string;
  intervalMax: string;
}

export interface IShedule {
  id?: string;
  countryId: string;
  workingDate: number[];
  workingFrom: number;
  workingTo: number;
  CreatedAt?: Date | string;
}

export interface ICountrySummary {
  name: string;
  pubicName: string;
  currency: string;
  TelIndex: string;
  TelMaxNumber: number | string;
  formatNumber: string;
}

export interface IDirection {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  code: string;
  fee: number;
  constant: number;
  min: number;
  max: number;
  nameFrom: string;
  nameTo: string;
  countryFrom: ICountrySummary;
  countryTo: ICountrySummary;
}
