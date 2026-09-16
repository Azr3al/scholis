const FINANCE_RECORD_ROUTE_PREFIXES = [
  "/finances",
  "/payment-plans",
  "/discounts",
  "/payment-methods",
  "/payment-infos",
  "/screenshots",
] as const;

/** True for finance workspace routes (overview, operations, and payment config). */
export function isFinanceRecordRoute(pathname: string): boolean {
  return FINANCE_RECORD_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
