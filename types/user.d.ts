import { ICountry } from './country';

export interface IClientResponse {
  id: string;
  email: string;
  fullName: string;
  clientNumber: number;
  whatsappNumber: string;
  Country: ICountry;
  gender: string;
}

export interface IClientUpdate {
  username?: string;
  phone?: string;
  password?: string;
  countryId?: string;
  /** Ignoré par l'API — l'identité vient du JWT. */
  userID?: string;
}

export interface IClientUpdateResponse {
  message: string;
  requireRelogin: boolean;
}
