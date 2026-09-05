import { getCookie } from "cookies-next";

/**
 * Browser calls same-origin `/attachments/*`; app route handler proxies to Juice Box (no CORS).
 * Set NEXT_PUBLIC_JUICEBOX_DIRECT=1 to call Juice Box from the browser instead.
 */
export function isJuiceBoxConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_JUICEBOX_ORIGIN?.trim());
}

function shouldUseSameOriginProxy(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return process.env.NEXT_PUBLIC_JUICEBOX_DIRECT !== "1";
}

export function getJuiceBoxOrigin(): string {
  if (shouldUseSameOriginProxy()) {
    return "";
  }

  const baseUrl = process.env.NEXT_PUBLIC_JUICEBOX_ORIGIN;
  if (!baseUrl) {
    throw new Error("Missing NEXT_PUBLIC_JUICEBOX_ORIGIN for JuiceBox requests.");
  }
  return baseUrl.replace(/\/$/, "");
}

export function juiceBoxAuthHeaders(): Record<string, string> {
  const token = (getCookie("access") || "") as string;
  const schema = (getCookie("schema") || "") as string;
  if (!token.trim() || !schema.trim()) {
    throw new Error("Missing auth for JuiceBox requests.");
  }
  return {
    Authorization: `Bearer ${token}`,
    "x-schema": schema,
  };
}
