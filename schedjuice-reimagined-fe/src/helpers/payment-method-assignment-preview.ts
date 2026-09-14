import { PaymentBank } from "@/types/finance";

export type PaymentMethodPreviewRow = {
  id: number;
  name: string;
  payment_bank?: string | null;
  bank_account_number?: string | null;
  is_retired?: boolean | null;
};

export type PaymentMethodBankGroup = {
  bank: string;
  methods: PaymentMethodPreviewRow[];
};

const BANK_ORDER = Object.values(PaymentBank);

export function shouldShowPaymentAssignmentPreview(
  tenant: {
    is_microsoft_on?: boolean;
    is_teams_creation_enabled?: boolean;
  } | null,
): boolean {
  return Boolean(tenant?.is_microsoft_on && tenant?.is_teams_creation_enabled);
}

export function samplePaymentAssignmentTitle(now = new Date()): string {
  const month = now.toLocaleString("en-US", { month: "long" });
  return `${month} ${now.getFullYear()} payment`;
}

export function samplePaymentAssignmentDueDate(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 3);
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function samplePaymentAssignmentDueLabel(due: Date): string {
  return `${due.getDate()} ${SHORT_MONTHS[due.getMonth()]}`;
}

export function groupActivePaymentMethodsByBank(
  methods: PaymentMethodPreviewRow[],
): PaymentMethodBankGroup[] {
  const active = methods.filter((method) => !method.is_retired);
  const byBank = new Map<string, PaymentMethodPreviewRow[]>();
  for (const method of active) {
    const bank = method.payment_bank?.trim() || "Other";
    const bucket = byBank.get(bank) ?? [];
    bucket.push(method);
    byBank.set(bank, bucket);
  }
  byBank.forEach((bucket) => {
    bucket.sort((a, b) => a.name.localeCompare(b.name));
  });

  const groups: PaymentMethodBankGroup[] = [];
  for (const bank of BANK_ORDER) {
    const bucket = byBank.get(bank);
    if (!bucket?.length) continue;
    groups.push({ bank, methods: bucket });
    byBank.delete(bank);
  }
  const leftover = Array.from(byBank.keys()).sort((a, b) => a.localeCompare(b));
  for (const bank of leftover) {
    const bucket = byBank.get(bank);
    if (!bucket?.length) continue;
    groups.push({ bank, methods: bucket });
  }
  return groups;
}
