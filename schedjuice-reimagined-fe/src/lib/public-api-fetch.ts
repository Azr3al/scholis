type PublicApiEnvelope<T> = {
  isError?: boolean;
  message?: string;
  data?: T;
};

/**
 * Unauthenticated fetch for public pages. Does not attach JWT cookies/headers,
 * so stale sessions cannot force a login redirect via the axios interceptor.
 */
export async function publicApiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const apiBase = (process.env.NEXT_PUBLIC_BASE_API_URL || "/api/v1").replace(
    /\/$/,
    "",
  );
  const url = `${apiBase}/${path.replace(/^\//, "")}`;
  const hasBody = init?.body != null;

  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const json = (await response.json().catch(() => ({}))) as PublicApiEnvelope<T>;
  if (!response.ok || json.isError || json.data == null) {
    throw new Error(json.message ?? "Request failed");
  }
  return json.data;
}
