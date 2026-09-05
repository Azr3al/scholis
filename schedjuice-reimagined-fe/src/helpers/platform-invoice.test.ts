import { describe, expect, it } from "vitest";
import {
  SCHEDJUICE_BILL_FROM_NAME,
  SCHEDJUICE_INVOICE_CONTACT,
  SCHEDJUICE_INVOICE_PAYMENT,
  buildPlatformInvoicePdfPayload,
  computeInvoiceValidUntil,
} from "@/helpers/platform-invoice";
import {
  PlatformInvoiceLineKind,
  PlatformInvoiceStatus,
  type PlatformInvoice,
} from "@/types/platform-invoice";

const baseInvoice: PlatformInvoice = {
  id: 1,
  invoice_number: 42,
  organization_id: 9,
  organization_name: "Teacher Su Center",
  billing_year: 2026,
  billing_month: 3,
  status: PlatformInvoiceStatus.Issued,
  line_items: [
    {
      kind: PlatformInvoiceLineKind.PlatformSeats,
      label: "Platform usage (March 2026)",
      quantity: 310,
      unit_label: "user-days",
      unit_amount: 500,
      amount: 15500,
      currency: "MMK",
      meta: { avg_active_users: 10, billing_row_count: 31 },
    },
    {
      kind: PlatformInvoiceLineKind.AiUsage,
      label: "AI usage (March 2026)",
      amount_usd: "12.50",
      currency: "USD",
      meta: { total_tokens: 1000, request_count: 5 },
    },
  ],
  totals: {
    platform_subtotal: 15500,
    currency_symbol: "Ks",
    currency_iso4217: "MMK",
    ai_subtotal_usd: "12.50",
  },
  generated_by_user_id: 1,
  generated_by_name: "Admin",
  generated_by_email: "admin@example.com",
  generated_at: "2026-04-01T00:00:00Z",
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
};

describe("computeInvoiceValidUntil", () => {
  it("returns date seven days after generated_at", () => {
    expect(computeInvoiceValidUntil("2026-04-01T00:00:00Z")).toBe("Apr 8th 2026");
  });
});

describe("buildPlatformInvoicePdfPayload", () => {
  it("maps invoice snapshot to PDF fields without recomputing totals", () => {
    const payload = buildPlatformInvoicePdfPayload(
      baseInvoice,
      SCHEDJUICE_BILL_FROM_NAME,
    );
    expect(payload.orgLogoUrl).toBeNull();
    expect(payload.invoiceNumber).toBe("42");
    expect(payload.billFromName).toBe("Schedjuice");
    expect(payload.billToName).toBe("Teacher Su Center");
    expect(payload.validUntilLabel).toBe("Apr 8th 2026");
    expect(payload.contactName).toBe(SCHEDJUICE_INVOICE_CONTACT.name);
    expect(payload.contactPhone).toBe(SCHEDJUICE_INVOICE_CONTACT.phone);
    expect(payload.contactEmail).toBe(SCHEDJUICE_INVOICE_CONTACT.email);
    expect(payload.paymentKbzPay).toBe(SCHEDJUICE_INVOICE_PAYMENT.kbzPay);
    expect(payload.paymentFeeNote).toBe(SCHEDJUICE_INVOICE_PAYMENT.feeNote);
    expect(payload.lineItems).toHaveLength(2);
    expect(payload.platformSubtotal).toContain("15");
    expect(payload.aiSubtotal).toContain("12");
  });

  it("maps flat rate line items for PDF output", () => {
    const withFlatRate: PlatformInvoice = {
      ...baseInvoice,
      line_items: [
        {
          kind: PlatformInvoiceLineKind.PlatformFlatRate,
          label: "Platform subscription (March 2026)",
          amount: 50000,
          currency: "MMK",
        },
        ...baseInvoice.line_items,
      ],
      totals: {
        ...baseInvoice.totals,
        flat_rate_subtotal: 50000,
      },
    };
    const payload = buildPlatformInvoicePdfPayload(withFlatRate);
    expect(payload.flatRateSubtotal).toContain("50");
    expect(payload.lineItems[0].detail).toBe("Monthly subscription");
  });
});
