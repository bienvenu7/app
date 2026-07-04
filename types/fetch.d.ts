export interface IBaseErrorData {
  status: string;
  message: string;
  statusCode: number;
}

export interface IBadResquestErrorData extends IBadResquestErrorData {
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
  refreshToken: string;
  statusCode: number;
}
