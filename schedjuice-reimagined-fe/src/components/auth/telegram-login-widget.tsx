"use client";

import { useEffect, useRef } from "react";

export type TelegramWidgetUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

export function TelegramLoginWidget({
  botUsername,
  onAuth,
}: {
  botUsername: string;
  onAuth: (user: TelegramWidgetUser) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    window.onTelegramAuth = (user) => {
      onAuthRef.current(user);
    };
    container.replaceChildren();

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute(
      "data-telegram-login",
      botUsername.replace(/^@/, ""),
    );
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      container.replaceChildren();
      delete window.onTelegramAuth;
    };
  }, [botUsername]);

  return <div ref={containerRef} className="flex w-full justify-center" />;
}
