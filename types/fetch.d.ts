export interface IBaseErrorData {
  status: string;
  message: string;
  statusCode: number;
}

export interface IBadResquestErrorData {
  status: string;
  message: string;
  statusCode: number;
  data: { message: string }[] | [];
}

export interface ISuccessData {
  message: string;
  statusCode: number;
}

export interface ISuccessOtpCodeResponse {
  accessToken: string;
  /** Access TTL in seconds (API default: 900). */
  expiresIn: number;
  statusCode: number;
}

export type TokenResponse = {
  accessToken?: string;
  access_token?: string;
  expiresIn?: number;
  refreshToken?: string;
  refresh?: string;
  refresh_token?: string;
};
