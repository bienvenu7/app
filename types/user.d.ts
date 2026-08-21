import { ICountry } from "./country";

/** Profil courant — `GET /v3/auth/get-auth` */
export interface IClientResponse {
  id: string;
  email: string;
  fullName: string;
  whatsappNumber: string;
  Country?: ICountry;
}

export type AuthProfile = IClientResponse;

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
