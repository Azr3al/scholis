export type PaymentMethodDisplaySource = {
  id?: number;
  name?: string | null;
  is_retired?: boolean | null;
};

export function formatPaymentMethodDisplayName(
  method: PaymentMethodDisplaySource,
): string {
  const name = method.name?.trim();
  const label = name || (method.id != null ? `Account #${method.id}` : "Payment method");
  if (method.is_retired) return `${label} (retired)`;
  return label;
}
