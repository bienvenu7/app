import cookies from "js-cookie";

/**
 * VPS / IP over HTTP: Secure cookies are rejected by the browser.
 * Vercel is HTTPS so Secure works there — match the page protocol, not NODE_ENV.
 */
const cookieSecure = (): boolean =>
  typeof window !== "undefined" && window.location.protocol === "https:";

export const setCookie = (name: string, value: string, days: number = 1) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  cookies.set(name, value, {
    expires,
    path: "/",
    sameSite: "lax",
    secure: cookieSecure(),
  });
};

export const getCookie = (name: string): string | null => {
  const cookieData = cookies.get(name);
  return cookieData ? cookieData : null;
};

export const deleteCookie = (data: string[]) => {
  data.forEach((name) => {
    cookies.remove(name, {
      path: "/",
      sameSite: "none", // ✅ allow cross-site
      secure: true, // ✅ requ
      expires: 0,
    });
  });
};

export const clearAuthCookies = () => {
  // Clear cookies with multiple approaches to handle Chrome caching
  const cookieNames = ["accessToken", "refreshToken", "uuid"];

  cookieNames.forEach((name) => {
    // Method 1: Remove with same attributes as set
    cookies.remove(name, {
      path: "/",
      sameSite: "none",
      secure: true,
    });

    // Method 2: Remove with different attributes (for compatibility)
    cookies.remove(name, {
      path: "/",
      sameSite: "lax",
      secure: false,
    });

    // Method 3: Set to empty with past expiration
    cookies.set(name, "", {
      path: "/",
      sameSite: "none",
      secure: true,
      expires: new Date(0),
    });

    // Method 4: Set to empty with different attributes
    cookies.set(name, "", {
      path: "/",
      sameSite: "lax",
      secure: false,
      expires: new Date(0),
    });
  });

  // Clear localStorage and sessionStorage
  localStorage.clear();
  sessionStorage.clear();

  // Force clear any remaining cookies by setting them to past date
  document.cookie.split(";").forEach((cookie) => {
    const eqPos = cookie.indexOf("=");
    const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
    if (cookieNames.includes(name)) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;secure`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;samesite=none`;
    }
  });
};
