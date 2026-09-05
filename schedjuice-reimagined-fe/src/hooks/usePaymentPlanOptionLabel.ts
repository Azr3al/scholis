import { formatPaymentPlanOptionLabel } from "@/helpers/payment-plan-label";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";

export function usePaymentPlanOptionLabel() {
  const currencySymbol = useTenantCurrencySymbol();
  const { can } = usePermissions();
  const showFee = can("payment.show_fee");

  return (plan: Parameters<typeof formatPaymentPlanOptionLabel>[0]) =>
    formatPaymentPlanOptionLabel(plan, currencySymbol, { showFee });
}
