import { formatMoney, formatPlainAmount } from "@/helpers/money";

const TWO_DP = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export function formatPayrollMoney(amount: number | string, symbol: string) {
  return formatMoney(amount, symbol, TWO_DP);
}

export function formatPayrollHours(hours: number) {
  return formatPlainAmount(hours, TWO_DP);
}
