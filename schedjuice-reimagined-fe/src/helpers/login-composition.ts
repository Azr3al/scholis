import type { organizationType } from "@/types/organization";

export type SocialLoginProvider = "microsoft" | "telegram" | "google";

export function shouldShowTelegramLogin(
  tenant: organizationType | null | undefined,
): boolean {
  if (!tenant?.is_telegram_login_on) {
    return false;
  }
  const botId = tenant.telegram_bot_id?.trim();
  return Boolean(botId);
}

export function shouldShowGoogleLogin(
  tenant: organizationType | null | undefined,
): boolean {
  return Boolean(tenant?.is_google_login_on);
}

export function shouldShowMicrosoftLogin(
  tenant: organizationType | null | undefined,
): boolean {
  return Boolean(tenant?.is_microsoft_on && tenant.app_id && tenant.authority);
}

export function getEnabledSocialProviders(
  tenant: organizationType | null | undefined,
): SocialLoginProvider[] {
  const providers: SocialLoginProvider[] = [];
  if (shouldShowMicrosoftLogin(tenant)) {
    providers.push("microsoft");
  }
  if (shouldShowTelegramLogin(tenant)) {
    providers.push("telegram");
  }
  if (shouldShowGoogleLogin(tenant)) {
    providers.push("google");
  }
  return providers;
}

export function normalizeTelegramBotUsername(
  username: string | null | undefined,
): string {
  return (username ?? "").trim().replace(/^@/, "");
}

export function buildTelegramOAuthUrl(options: {
  botId: string;
  origin: string;
  returnTo: string;
}): string {
  const params = new URLSearchParams({
    bot_id: options.botId,
    origin: options.origin,
    request_access: "write",
    return_to: options.returnTo,
  });
  return `https://oauth.telegram.org/auth?${params.toString()}`;
}

function normalizeApiBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, "");
}

export function buildGoogleLoginStartUrl(options: {
  remember: boolean;
  returnOrigin: string;
  returnPath?: string;
  apiBaseUrl?: string;
}): string {
  const base = normalizeApiBaseUrl(
    options.apiBaseUrl ?? process.env.NEXT_PUBLIC_BASE_API_URL ?? "",
  );
  const params = new URLSearchParams({
    return_origin: options.returnOrigin,
    return_path: options.returnPath ?? "/login",
    remember: options.remember ? "true" : "false",
  });
  return `${base}/google/oauth/start/login?${params.toString()}`;
}

export function parseGoogleOAuthReturn(searchParams: URLSearchParams): {
  handoffCode?: string;
  errorCode?: string;
  errorDetails?: string;
  linkSuccess?: boolean;
} | null {
  const handoffCode = searchParams.get("google_handoff")?.trim();
  if (handoffCode) {
    return { handoffCode };
  }

  const oauthStatus = searchParams.get("google_oauth")?.trim();
  if (oauthStatus === "success") {
    return { linkSuccess: true };
  }
  if (oauthStatus === "error") {
    return {
      errorCode:
        searchParams.get("google_oauth_message")?.trim() || "google_auth_invalid",
      errorDetails: searchParams.get("google_oauth_details")?.trim() || undefined,
    };
  }

  return null;
}

export type TelegramAuthPayload = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

const TG_AUTH_RESULT_PREFIX = "#tgAuthResult=";

function decodeBase64ToUtf8(encoded: string): string {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(encoded);
  }
  return Buffer.from(encoded, "base64").toString("utf-8");
}

function normalizeTelegramAuthFields(
  raw: Record<string, unknown>,
): TelegramAuthPayload | null {
  const idRaw = raw.id;
  const hashRaw = raw.hash;
  const authDateRaw = raw.auth_date;

  if (idRaw == null || hashRaw == null || authDateRaw == null) {
    return null;
  }

  const id = Number(idRaw);
  const auth_date = Number(authDateRaw);
  const hash = String(hashRaw);

  if (!Number.isFinite(id) || !Number.isFinite(auth_date) || !hash) {
    return null;
  }

  const payload: TelegramAuthPayload = {
    id,
    first_name: raw.first_name != null ? String(raw.first_name) : "",
    auth_date,
    hash,
  };

  if (raw.last_name != null && String(raw.last_name)) {
    payload.last_name = String(raw.last_name);
  }
  if (raw.username != null && String(raw.username)) {
    payload.username = String(raw.username);
  }
  if (raw.photo_url != null && String(raw.photo_url)) {
    payload.photo_url = String(raw.photo_url);
  }

  return payload;
}

export function parseTelegramOAuthHash(hash: string): TelegramAuthPayload | null {
  if (!hash.startsWith(TG_AUTH_RESULT_PREFIX)) {
    return null;
  }

  let encoded: string;
  try {
    encoded = decodeURIComponent(hash.slice(TG_AUTH_RESULT_PREFIX.length));
  } catch {
    return null;
  }
  if (!encoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64ToUtf8(encoded)) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return normalizeTelegramAuthFields(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function parseTelegramOAuthReturn(
  searchParams: URLSearchParams,
): TelegramAuthPayload | null {
  const idRaw = searchParams.get("id");
  const hash = searchParams.get("hash");
  const authDateRaw = searchParams.get("auth_date");
  if (!idRaw || !hash || !authDateRaw) {
    return null;
  }

  return normalizeTelegramAuthFields({
    id: idRaw,
    hash,
    auth_date: authDateRaw,
    first_name: searchParams.get("first_name") ?? "",
    last_name: searchParams.get("last_name") ?? undefined,
    username: searchParams.get("username") ?? undefined,
    photo_url: searchParams.get("photo_url") ?? undefined,
  });
}
