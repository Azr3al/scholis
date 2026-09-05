import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import {
  clearAuthCookies,
  getRefreshCredentials,
  persistAuthCookies,
  unwrapAuthTokenPayload,
  type AuthTokenPayload,
} from "@/helpers/auth-session";

import { getCookie } from "cookies-next";
import { isWebAuthPath } from "@/lib/linking/open-in-app-prompt-state";
import { isPublicApiUrl, isPublicWebPath } from "@/lib/public-web-paths";

const baseURL = process.env.NEXT_PUBLIC_BASE_API_URL;

if (!baseURL) {
  throw new Error("env variable 'NEXT_PUBLIC_BASE_API_URL' is not undefined.");
}

export const API_CLIENT_TIMEOUT_MS = 10_000;

const axiosClient = axios.create({
  baseURL,
  timeout: API_CLIENT_TIMEOUT_MS,
});

const refreshClient = axios.create({
  baseURL,
  timeout: API_CLIENT_TIMEOUT_MS,
});

function isAuthRefreshRequest(url?: string): boolean {
  return Boolean(url?.includes("token/refresh"));
}

function isAuthLogoutRequest(url?: string): boolean {
  return Boolean(url?.includes("logout"));
}

let isRefreshing = false;
let refreshWaitQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processRefreshQueue(error: unknown | null, accessToken: string | null) {
  refreshWaitQueue.forEach(({ resolve, reject }) => {
    if (error || !accessToken) {
      reject(error ?? new Error("Token refresh failed"));
    } else {
      resolve(accessToken);
    }
  });
  refreshWaitQueue = [];
}

export function redirectToLoginIfNeeded(): void {
  if (typeof window === "undefined") return;
  const pathname = window.location.pathname;
  if (isWebAuthPath(pathname) || isPublicWebPath(pathname)) return;
  window.location.href = "/login";
}

async function refreshAccessToken(): Promise<string> {
  const { refresh, session_id } = getRefreshCredentials();
  if (!refresh || !session_id) {
    throw new Error("Missing refresh credentials");
  }

  const schema = getCookie("schema");
  const response = await refreshClient.post<
    {
      isError: boolean;
      message: string;
      data?: AuthTokenPayload;
    } & Partial<AuthTokenPayload>
  >(
    "token/refresh",
    { refresh, session_id },
    {
      headers: schema ? { "X-Tenant": String(schema) } : undefined,
    },
  );

  const payload = unwrapAuthTokenPayload(response.data);
  if (response.data.isError || !payload?.access) {
    throw new Error(response.data.message || "Token refresh failed");
  }

  persistAuthCookies(payload);
  return payload.access;
}

axiosClient.interceptors.request.use(async (request) => {
  if (getCookie("access")) {
    request.headers["Authorization"] = `Bearer ${getCookie("access")}`;
  }
  const schema = getCookie("schema");
  if (schema) {
    request.headers["X-Tenant"] = String(schema);
  }
  return request;
});

axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      isAuthRefreshRequest(originalRequest.url) ||
      isAuthLogoutRequest(originalRequest.url) ||
      originalRequest.url?.includes("/login") ||
      (typeof window !== "undefined" &&
        (isPublicWebPath(window.location.pathname) ||
          isPublicApiUrl(originalRequest.url)))
    ) {
      return Promise.reject(error);
    }

    const { refresh, session_id } = getRefreshCredentials();
    if (!refresh || !session_id) {
      clearAuthCookies();
      redirectToLoginIfNeeded();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        refreshWaitQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers["Authorization"] = `Bearer ${token}`;
        return axiosClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const newAccess = await refreshAccessToken();
      processRefreshQueue(null, newAccess);
      originalRequest.headers["Authorization"] = `Bearer ${newAccess}`;
      return axiosClient(originalRequest);
    } catch (refreshError) {
      processRefreshQueue(refreshError, null);
      clearAuthCookies();
      redirectToLoginIfNeeded();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export { axiosClient };
