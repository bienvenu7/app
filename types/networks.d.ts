/** `GET /v3/network/get-networks/:countryId` */
export interface INetworkResponse {
  id: string;
  pubicName: string;
  name: string;
}

export type Network = INetworkResponse;

/** Hook mort (`get-fee`) — plus appelé par l'UI v3. */
export interface IFee {
  amount: string;
}

/** Compte de paiement imbriqué sur une transaction v3 */
export interface ICard {
  fullName?: string;
  phone?: string;
}

/** `GET /v3/country/get/cards/:countryId` */
export interface IResponseCard {
  id: string;
  content: string;
  isLink: boolean;
  isActive: boolean;
  network?: {
    name: string;
    pubicName: string;
  };
}

export type PaymentCard = IResponseCard;
