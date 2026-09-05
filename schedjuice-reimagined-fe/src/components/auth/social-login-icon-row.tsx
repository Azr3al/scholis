"use client";

import { Button } from "@/components/primitives";
import { GoogleIcon, TelegramIcon } from "@/components/connectors/connector-icons";
import {
  buildGoogleLoginStartUrl,
  buildTelegramOAuthUrl,
  getEnabledSocialProviders,
  type SocialLoginProvider,
} from "@/helpers/login-composition";
import { organizationType } from "@/types/organization";
import Image from "next/image";
import { cn } from "@/lib/utils";

const iconButtonClassName =
  "inline-flex size-11 items-center justify-center rounded-lg border border-border bg-surface hover:bg-surface-hover disabled:opacity-60";

export function SocialLoginIconRow({
  tenant,
  disabled = false,
  rememberMe = false,
  onMicrosoftLogin,
  onGoogleRedirect,
  onTelegramRedirect,
}: {
  tenant: organizationType | null | undefined;
  disabled?: boolean;
  rememberMe?: boolean;
  onMicrosoftLogin: () => void;
  onGoogleRedirect: () => void;
  onTelegramRedirect: () => void;
}) {
  const providers = getEnabledSocialProviders(tenant);
  if (providers.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-3"
      data-testid="social-login-icon-row"
    >
      {providers.map((provider) => (
        <SocialLoginIconButton
          key={provider}
          provider={provider}
          disabled={disabled}
          onMicrosoftLogin={onMicrosoftLogin}
          onGoogleRedirect={onGoogleRedirect}
          onTelegramRedirect={onTelegramRedirect}
          tenant={tenant}
        />
      ))}
    </div>
  );
}

function SocialLoginIconButton({
  provider,
  disabled,
  onMicrosoftLogin,
  onGoogleRedirect,
  onTelegramRedirect,
  tenant,
}: {
  provider: SocialLoginProvider;
  disabled?: boolean;
  onMicrosoftLogin: () => void;
  onGoogleRedirect: () => void;
  onTelegramRedirect: () => void;
  tenant: organizationType | null | undefined;
}) {
  if (provider === "microsoft") {
    return (
      <Button
        type="button"
        variant="ghost"
        className={cn(iconButtonClassName, "p-0")}
        disabled={disabled}
        aria-label="Sign in with Microsoft"
        title="Sign in with Microsoft"
        onClick={onMicrosoftLogin}
      >
        <Image
          unoptimized
          alt=""
          width={20}
          height={20}
          src="images/microsoft-logo.svg"
        />
      </Button>
    );
  }

  if (provider === "telegram") {
    const botId = tenant?.telegram_bot_id?.trim();
    return (
      <Button
        type="button"
        variant="ghost"
        className={cn(iconButtonClassName, "p-0 text-[#229ED9]")}
        disabled={disabled || !botId}
        aria-label="Sign in with Telegram"
        title="Sign in with Telegram"
        onClick={onTelegramRedirect}
      >
        <TelegramIcon className="size-5" />
      </Button>
    );
  }

  if (provider === "google") {
    return (
      <Button
        type="button"
        variant="ghost"
        className={cn(iconButtonClassName, "p-0")}
        disabled={disabled}
        aria-label="Sign in with Google"
        title="Sign in with Google"
        onClick={onGoogleRedirect}
      >
        <GoogleIcon className="size-5" />
      </Button>
    );
  }

  return null;
}

export function openTelegramOAuthLogin(tenant: organizationType | null | undefined) {
  const botId = tenant?.telegram_bot_id?.trim();
  if (!botId || typeof window === "undefined") {
    return;
  }
  const returnTo = `${window.location.origin}${window.location.pathname}`;
  const url = buildTelegramOAuthUrl({
    botId,
    origin: window.location.origin,
    returnTo,
  });
  window.location.assign(url);
}

export function openGoogleOAuthLogin(rememberMe: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  const url = buildGoogleLoginStartUrl({
    remember: rememberMe,
    returnOrigin: window.location.origin,
    returnPath: window.location.pathname || "/login",
  });
  window.location.assign(url);
}
