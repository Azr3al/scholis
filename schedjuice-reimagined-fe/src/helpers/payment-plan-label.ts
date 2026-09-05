import { formatMoney } from "@/helpers/money";
import { PaymentPlanBillingType } from "@/types/finance";

type PaymentPlanLabelSource = {
  name?: string | null;
  price?: number | string | null;
};

/** Option label for payment-plan selectors: `Name — Ks 10,000`. */
export function formatPaymentPlanOptionLabel(
  plan: PaymentPlanLabelSource,
  currencySymbol: string,
  options?: { showFee?: boolean },
): string {
  const name = plan.name?.trim() || "";
  if (options?.showFee === false) return name;
  if (plan.price == null || plan.price === "") return name;
  return `${name} — ${formatMoney(plan.price, currencySymbol)}`;
}

const BILLING_TYPE_LABELS: Record<PaymentPlanBillingType, string> = {
  [PaymentPlanBillingType.per_period]: "Per period",
  [PaymentPlanBillingType.whole_term]: "Whole term",
};

export function formatPaymentPlanBillingType(
  billingType: string | null | undefined,
): string | null {
  if (billingType == null || billingType === "") return null;
  return (
    BILLING_TYPE_LABELS[billingType as PaymentPlanBillingType] ??
    billingType.replaceAll("_", " ")
  );
}
