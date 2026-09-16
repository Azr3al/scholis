import { axiosClient } from "@/lib/api";
import { persistAuthCookies } from "@/helpers/auth-session";

import {
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";
import { getProtocol } from "@/helpers/host";
import { microsoftApiAccessScope } from "@/helpers/microsoft-api-scope";
import {
  clearStuckMsalInteractionStatus,
  isMsalInteractionInProgressError,
  validateMicrosoftMsalConfig,
} from "@/helpers/ms-login-error";
import axios from "axios";

export const MS_LOGIN_REMEMBER_KEY = "schedjuice.msLogin.remember";

const msalByKey = new Map<string, PublicClientApplication>();
const msalReadyByKey = new Map<string, Promise<PublicClientApplication>>();

let microsoftLoginChain: Promise<unknown> = Promise.resolve();

function msalCacheKey(clientId: string, authority: string): string {
  return `${clientId.trim()}::${authority.trim()}`;
}

async function withMicrosoftLoginLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = microsoftLoginChain;
  microsoftLoginChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function getMsalInstance(
  clientId: string,
  authority: string,
): Promise<PublicClientApplication> {
  const configError = validateMicrosoftMsalConfig(clientId, authority);
  if (configError) {
    throw new Error(configError);
  }

  const key = msalCacheKey(clientId, authority);
  const existingReady = msalReadyByKey.get(key);
  if (existingReady) {
    return existingReady;
  }

  const ready = (async () => {
    let instance = msalByKey.get(key);
    if (!instance) {
      instance = new PublicClientApplication({
        auth: {
          clientId: clientId.trim(),
          authority: authority.trim(),
          redirectUri: `${getProtocol()}://${window.location.host}/login`,
        },
      });
      msalByKey.set(key, instance);
    }
    await instance.initialize();
    return instance;
  })();

  msalReadyByKey.set(key, ready);
  try {
    return await ready;
  } catch (err) {
    msalReadyByKey.delete(key);
    msalByKey.delete(key);
    throw err;
  }
}

export function isMobileUserAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

type normalLoginProps = {
  email: string;
  password: string;
  isMicrosoft: false;
  remember?: boolean;
  onError: (e: any) => void;
};
type microsoftLoginProps = {
  isMicrosoft: true;
  clientId: string;
  authority: string;
  remember?: boolean;
};
type loginProps = normalLoginProps | microsoftLoginProps;

export type MicrosoftLoginFailure = {
  ok: false;
  error: unknown;
  stage: "msal" | "ms-login";
};

export type LoginResult =
  | true
  | false
  | "redirecting"
  | MicrosoftLoginFailure;

export type MicrosoftRedirectLoginResult =
  | true
  | false
  | MicrosoftLoginFailure;

function isMicrosoftLoginFailure(
  result: unknown,
): result is MicrosoftLoginFailure {
  return (
    typeof result === "object" &&
    result !== null &&
    "ok" in result &&
    (result as MicrosoftLoginFailure).ok === false
  );
}

export { isMicrosoftLoginFailure };

export type TelegramWidgetAuthPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export async function loginWithTelegram(
  payload: TelegramWidgetAuthPayload,
  remember: boolean,
): Promise<true> {
  const response = await axiosClient.post(
    "telegram-login",
    {
      ...payload,
      remember,
    },
    { headers: { Accept: "application/json" } },
  );
  persistAuthCookies(response.data);
  return true;
}

export async function exchangeGoogleHandoff(code: string): Promise<true> {
  const response = await axiosClient.post(
    "google/oauth/handoff/exchange",
    { code },
    { headers: { Accept: "application/json" } },
  );
  persistAuthCookies(response.data);
  return true;
}

function tagMicrosoftFailure(error: unknown): MicrosoftLoginFailure {
  return {
    ok: false,
    error,
    stage: axios.isAxiosError(error) ? "ms-login" : "msal",
  };
}

async function acquireTeamsOboAssertion(
  msal: PublicClientApplication,
  clientId: string,
  account: AccountInfo,
): Promise<string | undefined> {
  const scope = microsoftApiAccessScope(clientId);
  const request = { scopes: [scope], account };
  try {
    const silent = await msal.acquireTokenSilent(request);
    return silent.accessToken;
  } catch {
    try {
      const interactive = await msal.acquireTokenPopup(request);
      return interactive.accessToken;
    } catch (err) {
      console.warn("[ms-login] Could not acquire Teams OBO assertion:", err);
      return undefined;
    }
  }
}

async function exchangeMicrosoftToken(
  accessToken: string,
  remember: boolean,
  teamsAssertion?: string,
): Promise<true> {
  const response = await axiosClient.post(
    "ms-login",
    {
      token: accessToken,
      ...(teamsAssertion ? { teams_assertion: teamsAssertion } : {}),
      remember,
    },
    { headers: { Accept: "application/json" } },
  );
  if (
    response.data?.microsoft_teams_connected === false &&
    response.data?.microsoft_teams_oauth_detail
  ) {
    console.warn(
      "[ms-login] Teams posting not connected:",
      response.data.microsoft_teams_oauth_detail,
    );
  }
  persistAuthCookies(response.data);
  return true;
}

async function runInteractiveMicrosoftLogin(
  msal: PublicClientApplication,
  clientId: string,
  remember: boolean,
): Promise<LoginResult> {
  if (
    typeof window !== "undefined" &&
    isMobileUserAgent(navigator.userAgent)
  ) {
    if (remember) {
      sessionStorage.setItem(MS_LOGIN_REMEMBER_KEY, "1");
    } else {
      sessionStorage.removeItem(MS_LOGIN_REMEMBER_KEY);
    }
    await msal.loginRedirect({
      scopes: ["openid", "profile", "User.Read"],
    });
    return "redirecting";
  }

  const msResponse = await msal.loginPopup({
    scopes: ["openid", "profile", "User.Read"],
  });
  const teamsAssertion =
    msResponse.account == null
      ? undefined
      : await acquireTeamsOboAssertion(msal, clientId, msResponse.account);
  await exchangeMicrosoftToken(
    msResponse.accessToken,
    remember,
    teamsAssertion,
  );
  return true;
}

/** Complete an interactive Microsoft redirect after the user returns to `/login`. */
export async function completeMicrosoftRedirectLogin(
  clientId: string,
  authority: string,
): Promise<MicrosoftRedirectLoginResult> {
  return withMicrosoftLoginLock(async () => {
    try {
      const msal = await getMsalInstance(clientId, authority);
      const msResponse = await msal.handleRedirectPromise();
      if (!msResponse?.accessToken) {
        return false;
      }
      const remember =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(MS_LOGIN_REMEMBER_KEY) === "1";
      sessionStorage.removeItem(MS_LOGIN_REMEMBER_KEY);
      const teamsAssertion =
        msResponse.account == null
          ? undefined
          : await acquireTeamsOboAssertion(
              msal,
              clientId,
              msResponse.account,
            );
      await exchangeMicrosoftToken(
        msResponse.accessToken,
        remember,
        teamsAssertion,
      );
      return true;
    } catch (err) {
      if (isMsalInteractionInProgressError(err)) {
        clearStuckMsalInteractionStatus();
      }
      console.error("[ms-login redirect]", err);
      return tagMicrosoftFailure(err);
    }
  });
}

export const login = async (props: loginProps): Promise<LoginResult> => {
  if (props.isMicrosoft) {
    return withMicrosoftLoginLock(async () => {
      try {
        const msal = await getMsalInstance(props.clientId, props.authority);
        // Always drain redirect state before starting another interactive API.
        await msal.handleRedirectPromise();

        try {
          return await runInteractiveMicrosoftLogin(
            msal,
            props.clientId,
            props.remember ?? false,
          );
        } catch (err) {
          if (!isMsalInteractionInProgressError(err)) {
            throw err;
          }
          // Recover from a stuck lock left by a prior aborted popup/invalid config attempt.
          clearStuckMsalInteractionStatus();
          await msal.handleRedirectPromise();
          return await runInteractiveMicrosoftLogin(
            msal,
            props.clientId,
            props.remember ?? false,
          );
        }
      } catch (err) {
        console.error("[ms-login]", err);
        return tagMicrosoftFailure(err);
      }
    });
  }

  try {
    const response = await axiosClient.post("/login", {
      email: props.email,
      password: props.password,
      remember: props.remember ?? false,
    });
    persistAuthCookies(response.data);
    return true;
  } catch (e: any) {
    console.log(e);
    props.onError(e);
    return false;
  }
};

export const resendUserWelcomeEmail = (userId: string | number) =>
  axiosClient.post(`users/${userId}/resend-welcome-email`);

export type UserResignPayload = {
  inform_date?: string;
  last_working_date: string;
  type_of_pay?: string;
  employment_type?: string;
  remark?: string;
};

export const resignUser = (
  userId: string | number,
  payload: UserResignPayload,
) => axiosClient.post(`users/${userId}/resign`, payload);
