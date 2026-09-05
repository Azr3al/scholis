/** Fallback when tenant is not loaded or API omits `currency_symbol`. */
export const DEFAULT_TENANT_CURRENCY_SYMBOL = "Ks";

export type AmountFormatOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

/** Format a plain amount without currency, trimming trailing zeros (e.g. 10000.0000 → 10,000). */
export function formatPlainAmount(
  amount: number | string | null | undefined,
  options?: AmountFormatOptions,
): string {
  if (amount == null || amount === "") return "";
  const parsed = parseFloat(String(amount));
  if (!Number.isFinite(parsed)) return String(amount);
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: options?.minimumFractionDigits,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  }).format(parsed);
}

export const formatMoney = (
  amount: number | string,
  symbol?: string,
  options?: AmountFormatOptions,
) => {
  const sym = symbol ?? DEFAULT_TENANT_CURRENCY_SYMBOL;
  return `${sym} ${formatPlainAmount(amount, options)}`;
};

/**
 * Nullable decimal strings from APIs (e.g. cash flow). Pass symbol from
 * `useTenantCurrencySymbol()` for tenant display currency.
 */
export function formatDecimalString(
  amount: string | null | undefined,
  symbol: string = DEFAULT_TENANT_CURRENCY_SYMBOL,
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  return formatMoney(amount, symbol);
}
