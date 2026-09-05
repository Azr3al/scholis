export enum PlatformInvoiceStatus {
  Issued = "issued",
  Void = "void",
}

export enum PlatformInvoiceLineKind {
  PlatformSeats = "platform_seats",
  PlatformFlatRate = "platform_flat_rate",
  AiUsage = "ai_usage",
}

export type PlatformInvoiceFlatRateLine = {
  kind: PlatformInvoiceLineKind.PlatformFlatRate;
  label: string;
  amount: number;
  currency: string;
};

export type PlatformInvoicePlatformLine = {
  kind: PlatformInvoiceLineKind.PlatformSeats;
  label: string;
  quantity: number;
  unit_label: string;
  unit_amount: number;
  amount: number;
  currency: string;
  meta: {
    avg_active_users: number;
    billing_row_count: number;
  };
};

export type PlatformInvoiceAiLine = {
  kind: PlatformInvoiceLineKind.AiUsage;
  label: string;
  amount_usd: string;
  currency: "USD";
  meta: {
    total_tokens: number;
    request_count: number;
  };
};

export type PlatformInvoiceLineItem =
  | PlatformInvoicePlatformLine
  | PlatformInvoiceFlatRateLine
  | PlatformInvoiceAiLine;

export type PlatformInvoiceTotals = {
  platform_subtotal: number;
  currency_symbol: string;
  currency_iso4217: string;
  flat_rate_subtotal?: number;
  ai_subtotal_usd?: string;
};

export type PlatformInvoice = {
  id: number;
  invoice_number: number;
  organization_id: number;
  organization_name: string;
  billing_year: number;
  billing_month: number;
  status: PlatformInvoiceStatus;
  line_items: PlatformInvoiceLineItem[];
  totals: PlatformInvoiceTotals;
  generated_by_user_id: number | null;
  generated_by_name: string;
  generated_by_email: string;
  generated_at: string;
  created_at: string;
  updated_at: string;
};

export type PlatformInvoiceListResponse = {
  isError: boolean;
  message: string;
  data: PlatformInvoice[];
};

export type PlatformInvoiceResponse = {
  isError: boolean;
  message: string;
  data: PlatformInvoice;
};

export function formatInvoicePeriod(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

export function invoiceExistsForPeriod(
  invoices: PlatformInvoice[] | undefined,
  year: number,
  month: number,
): boolean {
  return (
    invoices?.some(
      (inv) =>
        inv.billing_year === year &&
        inv.billing_month === month &&
        inv.status === PlatformInvoiceStatus.Issued,
    ) ?? false
  );
}
