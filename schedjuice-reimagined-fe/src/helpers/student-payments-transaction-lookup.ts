/** Transaction lookup route (exact path). */
export const STUDENT_PAYMENTS_TRANSACTION_LOOKUP_PATH =
  "/finances/student-payments/transaction-lookup";

function isAllowedBackPath(pathOnly: string): boolean {
  return (
    pathOnly === "/finances/student-payments" ||
    pathOnly === "/finances/recent-transactions" ||
    /^\/courses\/[^/]+\/student-payments$/.test(pathOnly)
  );
}

/**
 * Validates `path?query` from `backHref` / legacy `returnTo` — relative app URLs only.
 */
export function safeBackHref(raw: string | null | undefined): string | null {
  if (raw == null || raw.trim() === "") return null;
  let s = raw.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  const pathOnly = s.includes("?") ? s.slice(0, s.indexOf("?")) : s;
  if (!isAllowedBackPath(pathOnly)) return null;
  return s;
}

/**
 * `…/transaction-lookup?transactionId=…&backHref=<current path+query or prior backHref>`.
 */
export function transactionDuplicatesHref(
  transactionId: string,
  pathname: string,
  searchParams: Pick<URLSearchParams, "get" | "toString">,
): string {
  const q = new URLSearchParams();
  const tid = transactionId.trim();
  if (tid) q.set("transactionId", tid);

  let backHref: string;
  if (pathname.startsWith(STUDENT_PAYMENTS_TRANSACTION_LOOKUP_PATH)) {
    const prev =
      searchParams.get("backHref") ?? searchParams.get("returnTo");
    backHref = safeBackHref(prev) ?? "/finances/student-payments";
  } else {
    const qs = searchParams.toString();
    backHref = `${pathname}${qs ? `?${qs}` : ""}`;
  }
  q.set("backHref", backHref);

  return `${STUDENT_PAYMENTS_TRANSACTION_LOOKUP_PATH}?${q.toString()}`;
}
