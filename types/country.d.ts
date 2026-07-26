export interface ICountry {
  id: string;
  pubicName: string;
  name: string;
  createdAt?: Date;
  currency: string;
  TelIndex: string;
  TelMaxNumber: string;
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
  CreatedAt: Date;
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
  countryFrom: {
    name: string;
    pubicName: string;
    currency: string;
    TelIndex: string;
    TelMaxNumber: number;
    formatNumber: string;
  };
  countryTo: {
    name: string;
    pubicName: string;
    currency: string;
    TelIndex: string;
    TelMaxNumber: number;
    formatNumber: true;
  };
}
