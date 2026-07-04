import axios from "axios";

// export const baseURL =
//   process.env.NODE_ENV === "production"
//     ? "https://api.afrue.com/v1/"
//     : "http://localhost:7001/v1/";

// export const baseURLV2 =
//   process.env.NODE_ENV === "production"
//     ? "https://api.afrue.com/v2/"
//     : "http://localhost:7001/v2/";

export const baseURL = "https://api.afrue.com/v1/";

export const baseURLV2 = "https://api.afrue.com/v2/";

export const instance = axios.create({
  baseURL: baseURL,
  withCredentials: true,
});

export const instanceV2 = axios.create({
  baseURL: baseURLV2,
  withCredentials: true,
});
