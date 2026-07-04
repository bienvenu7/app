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
  userID: string;
  username?: string | undefined;
  phone?: string | undefined;
  password?: string | undefined;
  countryId?: string | undefined;
}
