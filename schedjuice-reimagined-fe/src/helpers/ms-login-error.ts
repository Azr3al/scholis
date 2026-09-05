import axios from "axios";

const TOAST_MAX_LEN = 220;
const FALLBACK = "Microsoft sign-in failed";

type MsalLikeError = {
  errorCode?: unknown;
  errorMessage?: unknown;
  message?: unknown;
};

type ApiErrorBody = {
  isError?: boolean;
  details?: unknown;
  message?: unknown;
  error_type?: unknown;
};

function truncate(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= TOAST_MAX_LEN) {
    return trimmed;
  }
  return `${trimmed.slice(0, TOAST_MAX_LEN - 1)}…`;
}

function detailsToText(details: unknown): string | null {
  if (typeof details === "string" && details.trim()) {
    return details.trim();
  }
  if (details && typeof details === "object") {
    try {
      return JSON.stringify(details);
    } catch {
      return null;
    }
  }
  return null;
}

function formatMsalError(error: MsalLikeError): string | null {
  const code =
    typeof error.errorCode === "string" ? error.errorCode.trim() : "";
  const msg =
    typeof error.errorMessage === "string"
      ? error.errorMessage.trim()
      : "";
  // Only treat as MSAL when MSAL-specific fields are present (avoid AxiosError.message).
  if (!code && !msg) {
    return null;
  }
  if (code && msg) {
    return `Microsoft sign-in failed [${code}]: ${msg}`;
  }
  if (code) {
    return `Microsoft sign-in failed [${code}]`;
  }
  return `Microsoft sign-in failed: ${msg}`;
}

function formatAxiosError(error: unknown): string | null {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  if (!error.response) {
    if (error.code === "ERR_NETWORK") {
      return "ms-login: Could not reach the server. Check your network connection.";
    }
    if (error.code === "ECONNABORTED") {
      return "ms-login: The request timed out. Try again.";
    }
    if (error.message?.trim()) {
      return `ms-login: ${error.message.trim()}`;
    }
    return "ms-login: Could not reach the server.";
  }

  const status = error.response.status;
  const data = error.response.data as ApiErrorBody | undefined;
  const fromDetails = detailsToText(data?.details);
  const message =
    typeof data?.message === "string" ? data.message.trim() : "";
  const errorType =
    typeof data?.error_type === "string" ? data.error_type.trim() : "";

  const parts = [`ms-login ${status}`];
  if (errorType) {
    parts.push(errorType);
  }
  if (fromDetails) {
    parts.push(fromDetails);
  } else if (message) {
    parts.push(message);
  } else if (error.message?.trim()) {
    parts.push(error.message.trim());
  }

  return parts.join(": ").replace(": :", ":");
}

/**
 * Validate tenant MSAL fields before constructing PublicClientApplication.
 * Returns an error message for support/debug toasts, or null when valid.
 */
export function validateMicrosoftMsalConfig(
  clientId: string,
  authority: string,
): string | null {
  const appId = typeof clientId === "string" ? clientId.trim() : "";
  const authorityUrl = typeof authority === "string" ? authority.trim() : "";

  if (!appId) {
    return "Microsoft sign-in failed: missing app_id on this tenant.";
  }
  if (!authorityUrl) {
    return "Microsoft sign-in failed: missing authority on this tenant.";
  }

  try {
    // Absolute http(s) URL required — bare domains / tenant IDs throw TypeError in MSAL.
    const parsed = new URL(authorityUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `Microsoft sign-in failed: invalid authority URL (${JSON.stringify(authorityUrl)}). Expected e.g. https://login.microsoftonline.com/<tenant>.`;
    }
  } catch {
    return `Microsoft sign-in failed: invalid authority URL (${JSON.stringify(authorityUrl)}). Expected e.g. https://login.microsoftonline.com/<tenant>.`;
  }

  return null;
}

export function isMsalInteractionInProgressError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { errorCode?: unknown }).errorCode;
  return typeof code === "string" && code === "interaction_in_progress";
}

/** Clear stuck MSAL interaction locks left in sessionStorage after aborted popups/redirects. */
export function clearStuckMsalInteractionStatus(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.includes("interaction.status")) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    sessionStorage.removeItem(key);
  }
}

/** Format MSAL / ms-login failures for support-facing toast copy. */
export function formatMicrosoftLoginError(error: unknown): string {
  const axiosMessage = formatAxiosError(error);
  if (axiosMessage) {
    return truncate(axiosMessage);
  }

  if (error && typeof error === "object") {
    const msal = formatMsalError(error as MsalLikeError);
    if (msal) {
      return truncate(msal);
    }
  }

  if (error instanceof Error && error.message.trim()) {
    // validateMicrosoftMsalConfig already prefixes with FALLBACK.
    const msg = error.message.trim();
    if (msg.startsWith(FALLBACK)) {
      return truncate(msg);
    }
    return truncate(`${FALLBACK}: ${msg}`);
  }

  return FALLBACK;
}
