import { axiosClient } from "@/lib/api";

/** Teacher account binding via bot deep link. */
export const createTelegramLinkToken = () =>
  axiosClient.post<{ deep_link: string }>("telegram/link-token", {});

export const unlinkTelegramAccount = () =>
  axiosClient.post("telegram/unlink", {});

/** Platform superadmin: issue link token for another user. */
export const createTelegramLinkTokenForUser = (userId: number) =>
  axiosClient.post<{ deep_link: string }>(
    `users/${userId}/telegram-link-token`,
    {},
  );

/** Platform superadmin: force-unlink another user's Telegram account. */
export const unlinkTelegramAccountForUser = (userId: number) =>
  axiosClient.post(`users/${userId}/unlink-telegram`, {});

export const reRegisterTelegramWebhook = (rotateCredentials = false) =>
  axiosClient.post<{ ok: boolean; telegram_bot_username: string | null }>(
    "telegram/re-register-webhook",
    { rotate_credentials: rotateCredentials },
  );
