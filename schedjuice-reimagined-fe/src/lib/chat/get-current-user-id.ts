import { getCookie } from "cookies-next";

export function getCurrentUserIdFromCookie(): number | undefined {
  try {
    const raw = getCookie("account");
    if (!raw || typeof raw !== "string") return undefined;
    const account = JSON.parse(raw) as { id?: unknown };
    return typeof account.id === "number" ? account.id : undefined;
  } catch {
    return undefined;
  }
}
