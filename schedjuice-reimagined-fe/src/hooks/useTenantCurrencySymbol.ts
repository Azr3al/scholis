import { useTenant } from "@/hooks/useTenant";
import { DEFAULT_TENANT_CURRENCY_SYMBOL } from "@/helpers/money";

/**
 * Currency symbol from the current tenant (`organizations/public`).
 * Use with `formatMoney` / `formatDecimalString` for display.
 */
export function useTenantCurrencySymbol(): string {
  const { tenant } = useTenant();
  return tenant?.currency_symbol ?? DEFAULT_TENANT_CURRENCY_SYMBOL;
}
