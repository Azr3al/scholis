import {
  PlatformInvoiceLineKind,
  formatInvoicePeriod,
  type PlatformInvoice,
  type PlatformInvoiceLineItem,
} from "@/types/platform-invoice";
import { formatAiUsd } from "@/types/ai-usage";
import { formatMoney } from "@/helpers/money";
import { formatDate } from "@/helpers/date";
import { addDays, parseISO } from "date-fns";

/** Schedjuice brand mark on platform invoices issued to tenant clients. */
export const SCHEDJUICE_INVOICE_LOGO_PATH = "/images/logo.png";
export const SCHEDJUICE_BILL_FROM_NAME = "Schedjuice";

export const SCHEDJUICE_INVOICE_CONTACT = {
  name: "Min Phone Myat",
  phone: "+95 9789596138",
  email: "bruce@schedjuice.com",
} as const;

export const SCHEDJUICE_INVOICE_PAYMENT = {
  kbzPay: "09789596138 (Min Phone Myat)",
  feeNote:
    "Any transaction or processing fees will be covered by the client unless agreed otherwise.",
} as const;

export function computeInvoiceValidUntil(generatedAt: string): string {
  return formatDate(addDays(parseISO(generatedAt), 7));
}

export function getSchedjuiceInvoiceLogoUrl(): string {
  if (typeof window === "undefined") {
    return SCHEDJUICE_INVOICE_LOGO_PATH;
  }
  return new URL(SCHEDJUICE_INVOICE_LOGO_PATH, window.location.origin).href;
}

export async function resolveSchedjuiceInvoiceLogoForPdf(): Promise<
  string | null
> {
  const { inlineImageToDataUrl } = await import("@/lib/id-card/svg-data-url");
  return inlineImageToDataUrl(getSchedjuiceInvoiceLogoUrl());
}

export type PlatformInvoicePdfPayload = {
  invoiceNumber: string;
  periodLabel: string;
  generatedAt: string;
  validUntilLabel: string;
  billFromName: string;
  orgLogoUrl: string | null;
  billToName: string;
  generatedByName: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  paymentKbzPay: string;
  paymentFeeNote: string;
  lineItems: Array<{
    label: string;
    detail: string;
    amount: string;
  }>;
  platformSubtotal: string | null;
  flatRateSubtotal: string | null;
  aiSubtotal: string | null;
};

export function buildPlatformInvoicePdfPayload(
  invoice: PlatformInvoice,
  billFromName: string = SCHEDJUICE_BILL_FROM_NAME,
): PlatformInvoicePdfPayload {
  const currencySymbol = invoice.totals.currency_symbol;
  const lineItems = invoice.line_items.map((item) =>
    formatLineItemForPdf(item, currencySymbol),
  );

  const platformSubtotal =
    invoice.totals.platform_subtotal > 0
      ? formatMoney(invoice.totals.platform_subtotal, currencySymbol)
      : null;
  const flatRateSubtotal =
    invoice.totals.flat_rate_subtotal != null &&
    invoice.totals.flat_rate_subtotal > 0
      ? formatMoney(invoice.totals.flat_rate_subtotal, currencySymbol)
      : null;
  const aiSubtotal = invoice.totals.ai_subtotal_usd
    ? formatAiUsd(invoice.totals.ai_subtotal_usd)
    : null;

  return {
    invoiceNumber: String(invoice.invoice_number),
    periodLabel: formatInvoicePeriod(
      invoice.billing_year,
      invoice.billing_month,
    ),
    generatedAt: invoice.generated_at,
    validUntilLabel: computeInvoiceValidUntil(invoice.generated_at),
    billFromName,
    orgLogoUrl: null,
    billToName: invoice.organization_name,
    generatedByName: invoice.generated_by_name?.trim() || null,
    contactName: SCHEDJUICE_INVOICE_CONTACT.name,
    contactPhone: SCHEDJUICE_INVOICE_CONTACT.phone,
    contactEmail: SCHEDJUICE_INVOICE_CONTACT.email,
    paymentKbzPay: SCHEDJUICE_INVOICE_PAYMENT.kbzPay,
    paymentFeeNote: SCHEDJUICE_INVOICE_PAYMENT.feeNote,
    lineItems,
    platformSubtotal,
    flatRateSubtotal,
    aiSubtotal,
  };
}

function formatLineItemForPdf(
  item: PlatformInvoiceLineItem,
  currencySymbol: string,
): { label: string; detail: string; amount: string } {
  if (item.kind === PlatformInvoiceLineKind.PlatformFlatRate) {
    return {
      label: item.label,
      detail: "Monthly subscription",
      amount: formatMoney(item.amount, currencySymbol),
    };
  }
  if (item.kind === PlatformInvoiceLineKind.PlatformSeats) {
    return {
      label: item.label,
      detail: `${item.quantity.toLocaleString()} ${item.unit_label}`,
      amount: formatMoney(item.amount, currencySymbol),
    };
  }
  return {
    label: item.label,
    detail: `${item.meta.request_count.toLocaleString()} requests · ${item.meta.total_tokens.toLocaleString()} tokens`,
    amount: formatAiUsd(item.amount_usd),
  };
}

export function buildPlatformInvoiceFilename(invoice: PlatformInvoice): string {
  const period = `${invoice.billing_year}-${String(invoice.billing_month).padStart(2, "0")}`;
  return `platform-invoice-${invoice.invoice_number}-${period}.pdf`;
}

export async function downloadPlatformInvoicePdf(
  invoice: PlatformInvoice,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { preparePdfFonts } = await import("@/lib/sj/register-pdf-fonts");
  const { PlatformInvoicePdfDocument } =
    await import("@/components/platform/platform-invoice-pdf");
  const { downloadFile } = await import("@/helpers/file");

  const fonts = await preparePdfFonts();

  const payload = buildPlatformInvoicePdfPayload(
    invoice,
    SCHEDJUICE_BILL_FROM_NAME,
  );
  const orgLogoUrl = await resolveSchedjuiceInvoiceLogoForPdf();

  const blob = await pdf(
    PlatformInvoicePdfDocument({
      payload: { ...payload, orgLogoUrl },
      fonts,
    }),
  ).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, buildPlatformInvoiceFilename(invoice));
  } finally {
    URL.revokeObjectURL(url);
  }
}
