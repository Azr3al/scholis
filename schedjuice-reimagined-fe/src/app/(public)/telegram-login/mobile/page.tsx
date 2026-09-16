"use client";

import Script from "next/script";
import { useCallback, useEffect, useMemo, useState } from "react";

const ALLOWED_RETURN_SCHEMES = new Set([
  "schedjuice-mobile",
  "schedjuice-mobile-dev",
  "schedjuice-mobile-preview",
  "teachersucenter",
  "sdec",
]);

type TelegramAuthUser = {
  id: number;
  auth_date: number;
  hash: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

function parseReturnUrl(raw: string | null): URL | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (!ALLOWED_RETURN_SCHEMES.has(url.protocol.replace(":", ""))) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function buildRedirectUrl(returnUrl: URL, params: Record<string, string>): string {
  const next = new URL(returnUrl.toString());
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      next.searchParams.set(key, value);
    }
  }
  return next.toString();
}

export default function TelegramLoginMobileBridgePage() {
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [returnUrl, setReturnUrl] = useState<URL | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bot = params.get("bot")?.trim().replace(/^@/, "") ?? "";
    const parsedReturn = parseReturnUrl(params.get("return"));

    if (!bot) {
      setErrorMessage("Telegram login is not configured.");
      return;
    }
    if (!parsedReturn) {
      setErrorMessage("This sign-in link is invalid.");
      return;
    }

    setBotUsername(bot);
    setReturnUrl(parsedReturn);
  }, []);

  const redirectWithError = useCallback(
    (code: string) => {
      if (!returnUrl) {
        setErrorMessage("This sign-in link is invalid.");
        return;
      }
      window.location.href = buildRedirectUrl(returnUrl, { error: code });
    },
    [returnUrl],
  );

  const onTelegramAuth = useCallback(
    (user: TelegramAuthUser) => {
      if (!returnUrl) {
        setErrorMessage("This sign-in link is invalid.");
        return;
      }
      const params: Record<string, string> = {
        id: String(user.id),
        auth_date: String(user.auth_date),
        hash: user.hash,
      };
      if (user.first_name) params.first_name = user.first_name;
      if (user.last_name) params.last_name = user.last_name;
      if (user.username) params.username = user.username;
      if (user.photo_url) params.photo_url = user.photo_url;
      window.location.href = buildRedirectUrl(returnUrl, params);
    },
    [returnUrl],
  );

  useEffect(() => {
    (window as Window & { onTelegramAuth?: (user: TelegramAuthUser) => void }).onTelegramAuth =
      onTelegramAuth;
    return () => {
      delete (window as Window & { onTelegramAuth?: (user: TelegramAuthUser) => void })
        .onTelegramAuth;
    };
  }, [onTelegramAuth]);

  const widgetReady = Boolean(botUsername && returnUrl);

  const widgetContainerId = useMemo(() => "telegram-login-widget", []);

  useEffect(() => {
    if (!widgetReady || !botUsername) {
      return;
    }
    const container = document.getElementById(widgetContainerId);
    if (!container) {
      return;
    }
    container.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);
  }, [botUsername, widgetContainerId, widgetReady]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-12">
      <div className="max-w-sm space-y-2 text-center">
        <h1 className="text-lg font-semibold text-foreground">Sign in with Telegram</h1>
        <p className="text-sm text-muted-foreground">
          Continue in Telegram, then return to the app.
        </p>
      </div>

      {errorMessage ? (
        <p className="max-w-sm text-center text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {widgetReady ? (
        <>
          <div id={widgetContainerId} className="min-h-11" />
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => redirectWithError("cancelled")}
          >
            Cancel
          </button>
        </>
      ) : null}

      <Script id="telegram-auth-stub" strategy="afterInteractive">
        {`function onTelegramAuth(user) {
          if (window.onTelegramAuth) window.onTelegramAuth(user);
        }`}
      </Script>
    </main>
  );
}
