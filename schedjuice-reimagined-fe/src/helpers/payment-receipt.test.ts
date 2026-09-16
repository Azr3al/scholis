import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/helpers/date", () => ({
  formatDate: (iso: string) => iso.slice(0, 10),
}));

const makeGetRequest = vi.fn();
vi.mock("@/app/client-api/utils", () => ({
  makeGetRequest: (...args: unknown[]) => makeGetRequest(...args),
}));

const pdfToBlob = vi.fn();
vi.mock("@react-pdf/renderer", () => ({
  pdf: vi.fn(() => ({ toBlob: pdfToBlob })),
}));

const downloadFile = vi.fn();
vi.mock("@/helpers/file", () => ({
  downloadFile: (...args: unknown[]) => downloadFile(...args),
}));

vi.mock("@/components/finances/payment-receipt-pdf", () => ({
  PaymentReceiptPdfDocument: vi.fn(() => null),
}));

import { canDownloadPaymentReceipt } from "@/helpers/authorization";
import {
  buildGroupPaymentReceiptPayload,
  buildPaymentReceiptFilename,
  buildPaymentReceiptPayload,
  downloadGroupPaymentReceipt,
  downloadReceiptForPaymentRow,
  enrichPaymentReceiptRow,
  formatPaymentReceiptBillingPeriod,
  formatReceiptDate,
  formatReceiptDateTime,
  ReceiptDownloadError,
  resolveLogoForPdf,
  resolvePaymentReceiptPaidAmount,
  resolveReceiptAuthorizedSignature,
  resolveReceiptTimezone,
  type PaymentReceiptRowInput,
} from "@/helpers/payment-receipt";
import { UserPaymentStatus } from "@/types/finance";
import { role, type accountType } from "@/types/user";

function userWithPermissions(permissions: string[]): accountType {
  return { id: 1, roles: [role.admin], permissions } as accountType;
}

describe("canDownloadPaymentReceipt", () => {
  it("allows users with payment verify, export, or view_all", () => {
    expect(canDownloadPaymentReceipt(userWithPermissions(["payment.verify"]))).toBe(true);
    expect(canDownloadPaymentReceipt(userWithPermissions(["payment.export"]))).toBe(true);
    expect(canDownloadPaymentReceipt(userWithPermissions(["payment.view_all"]))).toBe(true);
  });

  it("denies users without payment receipt permissions", () => {
    expect(canDownloadPaymentReceipt(userWithPermissions(["course.view"]))).toBe(false);
    expect(canDownloadPaymentReceipt(userWithPermissions(["payment.view"]))).toBe(false);
  });
});

describe("buildPaymentReceiptFilename", () => {
  it("uses transaction id when present", () => {
    expect(
      buildPaymentReceiptFilename({ id: 42, transaction_id: "FT123ABC" }),
    ).toBe("receipt-FT123ABC.pdf");
  });

  it("falls back to payment id", () => {
    expect(
      buildPaymentReceiptFilename({ id: 42, transaction_id: null }),
    ).toBe("receipt-payment-42.pdf");
  });
});

describe("resolvePaymentReceiptPaidAmount", () => {
  it("prefers actual, then parsed, then invoiced", () => {
    expect(
      resolvePaymentReceiptPaidAmount({
        actual_amount: "10",
        parsed_amount: "20",
        invoiced_amount: "30",
      }),
    ).toBe("10");
    expect(
      resolvePaymentReceiptPaidAmount({
        actual_amount: null,
        parsed_amount: "20",
        invoiced_amount: "30",
      }),
    ).toBe("20");
    expect(
      resolvePaymentReceiptPaidAmount({
        actual_amount: null,
        parsed_amount: null,
        invoiced_amount: "30",
      }),
    ).toBe("30");
  });
});

describe("formatPaymentReceiptBillingPeriod", () => {
  const base: PaymentReceiptRowInput = {
    id: 1,
    billing_start_date: null,
    billing_end_date: null,
    issued_at: null,
    covered_months: [],
  };

  it("formats contiguous months as a range", () => {
    expect(
      formatPaymentReceiptBillingPeriod({
        ...base,
        covered_months: [
          { year: 2026, month_index: 1 },
          { year: 2026, month_index: 2 },
          { year: 2026, month_index: 3 },
        ],
      }),
    ).toBe("January 2026 – March 2026");
  });

  it("comma-separates gapped months", () => {
    expect(
      formatPaymentReceiptBillingPeriod({
        ...base,
        covered_months: [
          { year: 2026, month_index: 1 },
          { year: 2026, month_index: 3 },
        ],
      }),
    ).toBe("January 2026, March 2026");
  });

  it("uses billing date range when set", () => {
    const result = formatPaymentReceiptBillingPeriod({
      ...base,
      billing_start_date: "2026-01-01T00:00:00.000Z",
      billing_end_date: "2026-01-31T23:59:59.000Z",
    });
    expect(result).toBe("2026-01-01 – 2026-01-31");
  });

  it("falls back to issued_at", () => {
    const result = formatPaymentReceiptBillingPeriod({
      ...base,
      issued_at: "2026-03-15T12:00:00.000Z",
    });
    expect(result).toBe("2026-03-15");
  });

  it("returns em dash when no dates", () => {
    expect(formatPaymentReceiptBillingPeriod(base)).toBe("—");
  });
});

describe("resolveLogoForPdf", () => {
  it("returns null for empty urls", async () => {
    expect(await resolveLogoForPdf(null)).toBeNull();
    expect(await resolveLogoForPdf("")).toBeNull();
    expect(await resolveLogoForPdf("   ")).toBeNull();
  });

  it("returns url when image loads", async () => {
    const OriginalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    // @ts-expect-error test stub
    globalThis.Image = FakeImage;
    await expect(
      resolveLogoForPdf("https://cdn.example.com/logo.png"),
    ).resolves.toBe("https://cdn.example.com/logo.png");
    globalThis.Image = OriginalImage;
  });

  it("returns null when image errors", async () => {
    const OriginalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    // @ts-expect-error test stub
    globalThis.Image = FakeImage;
    await expect(
      resolveLogoForPdf("https://cdn.example.com/missing.png"),
    ).resolves.toBeNull();
    globalThis.Image = OriginalImage;
  });

  it("returns null on timeout", async () => {
    vi.useFakeTimers();
    const OriginalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        /* never settles */
      }
    }
    // @ts-expect-error test stub
    globalThis.Image = FakeImage;
    const pending = resolveLogoForPdf("https://cdn.example.com/slow.png", 50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toBeNull();
    globalThis.Image = OriginalImage;
    vi.useRealTimers();
  });
});

describe("receipt timezone formatting", () => {
  const instant = new Date("2026-07-21T12:00:00.000Z");

  it("resolveReceiptTimezone falls back to UTC", () => {
    expect(resolveReceiptTimezone(undefined)).toBe("UTC");
    expect(resolveReceiptTimezone(null)).toBe("UTC");
    expect(resolveReceiptTimezone("")).toBe("UTC");
    expect(resolveReceiptTimezone("Asia/Rangoon")).toBe("Asia/Rangoon");
  });

  it("formats generatedAt in Asia/Rangoon independently of browser locale", () => {
    expect(formatReceiptDateTime(instant, "Asia/Rangoon")).toBe(
      "Jul 21, 2026, 6:30 PM GMT+6:30",
    );
  });

  it("formats generatedAt in UTC", () => {
    expect(formatReceiptDateTime(instant, "UTC")).toBe(
      "Jul 21, 2026, 12:00 PM UTC",
    );
  });

  it("formats receiptDate date-only in tenant TZ", () => {
    expect(formatReceiptDate(instant, "Asia/Rangoon")).toBe("Jul 21, 2026");
    expect(formatReceiptDate("2026-07-21T22:00:00.000Z", "Asia/Rangoon")).toBe(
      "Jul 22, 2026",
    );
  });
});

describe("buildPaymentReceiptPayload timezone", () => {
  it("uses tenant timezone for generatedAt and receiptDate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
    const payload = buildPaymentReceiptPayload(
      {
        id: 1,
        payment_date: "2026-07-21T22:00:00.000Z",
        issued_at: "2026-01-01T00:00:00.000Z",
        actual_amount: "100",
      },
      { name: "Acme", logo: null, timezone: "Asia/Rangoon" },
      "$",
    );
    expect(payload.receiptDate).toBe("Jul 22, 2026");
    expect(payload.generatedAt).toBe("Jul 21, 2026, 6:30 PM GMT+6:30");
    vi.useRealTimers();
  });
});

describe("receipt payment_date", () => {
  it("uses payment_date instead of issued_at", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 1,
        payment_date: "2026-03-10T00:00:00.000Z",
        issued_at: "2026-07-01T00:00:00.000Z",
        actual_amount: "100",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.receiptDate).toBe("Mar 10, 2026");
  });

  it("group receipt uses earliest part payment_date", () => {
    const payload = buildGroupPaymentReceiptPayload(
      {
        id: "group-1",
        group_id: 1,
        kind: "group",
        user: { name: "Jane" },
        course: { title: "Math" },
        parts: [
          {
            id: 1,
            payment_date: "2026-05-01T00:00:00.000Z",
            actual_amount: "100",
          },
          {
            id: 2,
            payment_date: "2026-04-01T00:00:00.000Z",
            actual_amount: "100",
          },
        ],
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.receiptDate).toBe("Apr 1, 2026");
  });
});

describe("buildPaymentReceiptPayload amounts", () => {
  it("includes discount and invoiced when they apply", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        user: { name: "Jane" },
        course: { title: "Math" },
        base_amount: "500",
        discount_amount: "50",
        discount_label: "Sibling",
        invoiced_amount: "450",
        actual_amount: "400",
        parsed_amount: "400",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.baseAmount).toMatch(/500/);
    expect(payload.discountLine).toMatch(/Sibling/);
    expect(payload.discountLine).toMatch(/50/);
    expect(payload.discountLines).toBeNull();
    expect(payload.invoicedAmount).toMatch(/450/);
    expect(payload.amountPaid).toMatch(/400/);
  });

  it("emits per-discount lines when discount_lines has multiple entries", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        user: { name: "Jane" },
        course: { title: "Math" },
        base_amount: "500",
        discount_amount: "75",
        discount_label: "Early bird + Loyalty",
        discount_lines: [
          { label: "Early bird", amount: "50" },
          { label: "Loyalty", amount: "25" },
        ],
        invoiced_amount: "425",
        actual_amount: "425",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.discountLine).toBeNull();
    expect(payload.discountLines).toEqual([
      "Early bird (-$ 50)",
      "Loyalty (-$ 25)",
    ]);
  });

  it("uses discount_lines amount for a single stacked line", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        base_amount: "500",
        discount_amount: "75",
        discount_label: "Early bird + Loyalty",
        discount_lines: [{ label: "Early bird", amount: "50" }],
        actual_amount: "450",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.discountLine).toMatch(/Early bird/);
    expect(payload.discountLine).toMatch(/-.*50/);
    expect(payload.discountLine).not.toMatch(/75/);
  });

  it("omits invoiced when equal to paid", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        invoiced_amount: "450",
        actual_amount: "450",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.invoicedAmount).toBeNull();
  });

  it("subtracts refund from amount paid and shows a refund line", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        actual_amount: "400",
        total_refunded: "25.50",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.refundLine).toMatch(/Refund/);
    expect(payload.refundLine).toMatch(/25\.5/);
    expect(payload.amountPaid).toMatch(/374\.5/);
  });

  it("nets paid to date on term progress using total_refunded_to_date", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        actual_amount: "190000",
        term_total: "410000",
        paid_to_date: "190000",
        total_refunded_to_date: "25000",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.termProgress).toMatch(/410,?000/);
    expect(payload.termProgress).toMatch(/165,?000/);
    expect(payload.termProgress).not.toMatch(/190,?000/);
  });
});

describe("buildPaymentReceiptPayload footer people", () => {
  it("includes downloaded, created, and verified names", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        created_by: { name: "Creator Admin" },
        verified_by: { name: "Verifier Admin" },
        actual_amount: "100",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
      "Downloader User",
    );
    expect(payload.downloadedBy).toBe("Downloader User");
    expect(payload.createdBy).toBe("Creator Admin");
    expect(payload.verifiedBy).toBe("Verifier Admin");
  });

  it("falls back downloadedBy to em dash and omits empty created/verified", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        created_by: { name: "  " },
        verified_by: null,
        actual_amount: "100",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
      null,
    );
    expect(payload.downloadedBy).toBe("—");
    expect(payload.createdBy).toBeNull();
    expect(payload.verifiedBy).toBeNull();
  });

  it("prefers verified_by signature over created_by", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        created_by: {
          name: "Creator Admin",
          user_signature_url: "https://example.com/creator.png",
        },
        verified_by: {
          name: "Verifier Admin",
          user_signature_url: "https://example.com/verifier.png",
        },
        actual_amount: "100",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.authorizedSignatureName).toBe("Verifier Admin");
    expect(payload.authorizedSignatureUrl).toBe(
      "https://example.com/verifier.png",
    );
  });

  it("falls back to created_by signature when verifier has none", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        created_by: {
          name: "Creator Admin",
          user_signature_url: "https://example.com/creator.png",
        },
        verified_by: { name: "Verifier Admin" },
        actual_amount: "100",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.authorizedSignatureName).toBe("Creator Admin");
    expect(payload.authorizedSignatureUrl).toBe(
      "https://example.com/creator.png",
    );
  });

  it("omits signature when verified_by is Multiple", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        verified_by: {
          name: "Multiple",
          user_signature_url: "https://example.com/x.png",
        },
        actual_amount: "100",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.authorizedSignatureUrl).toBeNull();
  });
});

describe("resolveReceiptAuthorizedSignature", () => {
  it("returns null when no signature URLs exist", () => {
    expect(
      resolveReceiptAuthorizedSignature({
        verified_by: { name: "Verifier" },
        created_by: { name: "Creator" },
      }),
    ).toEqual({ name: null, signatureUrl: null });
  });
});

describe("receipt number display", () => {
  const tenant = { name: "Acme", logo: null, timezone: "UTC" };

  it("uses receipt_number when present", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 999,
        receipt_number: 42,
        user: { name: "Jane" },
        course: { title: "Math" },
        transaction_id: "TX-1",
        actual_amount: "100",
        payment_method: { name: "Cash" },
      },
      tenant,
      "$",
    );
    expect(payload.receiptNumber).toBe("42");
  });

  it("uses em dash when receipt_number is null (never payment id)", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 999,
        receipt_number: null,
        user: { name: "Jane" },
        course: { title: "Math" },
        transaction_id: "TX-1",
        actual_amount: "100",
        payment_method: { name: "Cash" },
      },
      tenant,
      "$",
    );
    expect(payload.receiptNumber).toBe("—");
  });

  it("group receipt uses the group's shared receipt number", () => {
    const payload = buildGroupPaymentReceiptPayload(
      {
        id: "group-12",
        group_id: 12,
        receipt_number: 3,
        user: { name: "Jane" },
        course: { title: "Math" },
        payment_method: { name: "Multiple" },
        parts: [
          {
            id: 1,
            receipt_number: 3,
            transaction_id: "A",
            actual_amount: "10",
          },
          {
            id: 2,
            receipt_number: 3,
            transaction_id: "B",
            actual_amount: "20",
          },
        ],
      },
      tenant,
      "$",
    );
    expect(payload.receiptNumber).toBe("3");
  });

  it("does not guess a group number from parts when the row omits one", () => {
    const payload = buildGroupPaymentReceiptPayload(
      {
        id: "group-13",
        group_id: 13,
        user: { name: "Jane" },
        course: { title: "Math" },
        payment_method: { name: "Multiple" },
        parts: [
          {
            id: 1,
            receipt_number: 41,
            transaction_id: "A",
            actual_amount: "10",
          },
          {
            id: 2,
            receipt_number: 42,
            transaction_id: "B",
            actual_amount: "20",
          },
        ],
      },
      tenant,
      "$",
    );
    expect(payload.receiptNumber).toBe("—");
  });
});

describe("enrichPaymentReceiptRow", () => {
  beforeEach(() => {
    makeGetRequest.mockReset();
  });

  it("merges receipt_number from user-payments GET when admin-report omitted it", async () => {
    makeGetRequest.mockResolvedValue({
      data: { data: { id: 183, receipt_number: 5 } },
    });
    const enriched = await enrichPaymentReceiptRow({
      id: 183,
      user: { name: "Ei Su Ko" },
      transaction_id: "01004220030204177033",
    });
    expect(makeGetRequest).toHaveBeenCalledWith("user-payments/183");
    expect(enriched.receipt_number).toBe(5);
    expect(enriched.user?.name).toBe("Ei Su Ko");
    expect(buildPaymentReceiptPayload(enriched, { name: "EC", logo: null, timezone: "UTC" }, "Ks").receiptNumber).toBe(
      "5",
    );
  });

  it("preserves nested display fields when GET returns FK ids", async () => {
    makeGetRequest.mockResolvedValue({
      data: {
        data: {
          id: 183,
          receipt_number: 5,
          actual_amount: "400",
          total_refunded: "25.50",
          user: 42,
          course: 7,
          payment_method: 3,
        },
      },
    });
    const enriched = await enrichPaymentReceiptRow({
      id: 183,
      user: { name: "Ei Su Ko" },
      course: { title: "Math" },
      payment_method: { name: "KPay" },
      actual_amount: "400",
    });
    expect(enriched.user?.name).toBe("Ei Su Ko");
    expect(enriched.course?.title).toBe("Math");
    expect(enriched.payment_method?.name).toBe("KPay");
    const payload = buildPaymentReceiptPayload(
      enriched,
      { name: "School", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.studentName).toBe("Ei Su Ko");
    expect(payload.courseTitle).toBe("Math");
    expect(payload.paymentMethod).toBe("KPay");
    expect(payload.amountPaid).toMatch(/374\.5/);
    expect(payload.refundLine).toMatch(/25\.5/);
  });

  it("merges total_refunded from user-payments GET for net receipt amounts", async () => {
    makeGetRequest.mockResolvedValue({
      data: {
        data: {
          id: 183,
          receipt_number: 5,
          actual_amount: "400",
          total_refunded: "25.50",
        },
      },
    });
    const enriched = await enrichPaymentReceiptRow({
      id: 183,
      actual_amount: "400",
    });
    expect(enriched.total_refunded).toBe("25.50");
    const payload = buildPaymentReceiptPayload(
      enriched,
      { name: "EC", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.amountPaid).toMatch(/374\.5/);
    expect(payload.refundLine).toMatch(/25\.5/);
  });

  it("does not invent a receipt number from payment id when GET has none", async () => {
    makeGetRequest.mockResolvedValue({
      data: { data: { id: 183, receipt_number: null } },
    });
    const enriched = await enrichPaymentReceiptRow({ id: 183 });
    expect(enriched.receipt_number).toBeUndefined();
    expect(
      buildPaymentReceiptPayload(
        enriched,
        { name: "EC", logo: null, timezone: "UTC" },
        "Ks",
      ).receiptNumber,
    ).toBe("—");
  });

  it("fetches the group for a bare group stub carrying neither kind nor parts", async () => {
    makeGetRequest.mockResolvedValue({
      data: {
        data: {
          id: "group-9",
          kind: "group",
          group_id: 9,
          receipt_number: 41,
          user: { name: "Group Student" },
          parts: [
            { id: 11, course: { id: 1, title: "IELTS Morning" } },
            { id: 12, course: { id: 2, title: "Business English" } },
          ],
        },
      },
    });
    const enriched = await enrichPaymentReceiptRow({
      id: "group-9",
      group_id: 9,
    });
    expect(makeGetRequest).toHaveBeenCalledWith("user-payment-groups/9");
    expect(enriched.parts).toHaveLength(2);
    expect(enriched.receipt_number).toBe(41);
    expect(enriched.user?.name).toBe("Group Student");
  });

  it("fetches the group, not the payment, for a flattened per-course row", async () => {
    makeGetRequest.mockResolvedValue({
      data: {
        data: {
          id: "group-9",
          kind: "group",
          group_id: 9,
          receipt_number: 41,
          parts: [{ id: 11, course: { id: 1, title: "IELTS Morning" } }],
        },
      },
    });
    const enriched = await enrichPaymentReceiptRow({
      id: 11,
      group_id: 9,
      course: { id: 1, title: "IELTS Morning" },
    });
    expect(makeGetRequest).toHaveBeenCalledWith("user-payment-groups/9");
    expect(makeGetRequest).not.toHaveBeenCalledWith("user-payments/11");
    expect(enriched.receipt_number).toBe(41);
  });

  it("builds every course line and the shared number from an enriched multi-course group", async () => {
    makeGetRequest.mockResolvedValue({
      data: {
        data: {
          id: "group-9",
          kind: "group",
          group_id: 9,
          receipt_number: 41,
          user: { name: "Ei Su Ko" },
          parts: [
            {
              id: 11,
              course: { id: 1, title: "IELTS Morning" },
              actual_amount: "150",
            },
            {
              id: 12,
              course: { id: 2, title: "Business English" },
              actual_amount: "50",
            },
          ],
        },
      },
    });
    const enriched = await enrichPaymentReceiptRow({
      id: 11,
      group_id: 9,
      course: { id: 1, title: "IELTS Morning" },
    });
    const payload = buildGroupPaymentReceiptPayload(
      enriched,
      { name: "EC", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.courseLines?.map((line) => line.courseTitle)).toEqual([
      "IELTS Morning",
      "Business English",
    ]);
    expect(payload.receiptNumber).toBe("41");
    expect(payload.amountPaid).toBe("$ 200");
  });
});

describe("group receipt", () => {
  it("builds combined group payload without parts section", () => {
    const payload = buildGroupPaymentReceiptPayload(
      {
        id: "group-12",
        group_id: 12,
        kind: "group",
        user: { name: "Jane" },
        course: { title: "Math" },
        payment_method: { name: "Multiple" },
        discount_label: "Sibling",
        base_amount: "1000",
        discount_amount: "100",
        parts: [
          {
            id: 1,
            transaction_id: "TX-A",
            actual_amount: "200",
          },
          {
            id: 2,
            transaction_id: "TX-B",
            actual_amount: "250",
          },
        ],
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
      "Staff User",
    );
    expect(payload.receiptNumber).toBe("—");
    expect(payload.amountPaid).toMatch(/450/);
    expect(payload.refundLine).toBeNull();
    expect(payload.parts).toBeNull();
    expect(payload.transactionId).toBe("—");
    expect(payload.downloadedBy).toBe("Staff User");
  });

  it("nets group amount paid when parts have refunds", () => {
    const payload = buildGroupPaymentReceiptPayload(
      {
        id: "group-12",
        group_id: 12,
        kind: "group",
        user: { name: "Jane" },
        course: { title: "Math" },
        payment_method: { name: "Multiple" },
        parts: [
          {
            id: 1,
            transaction_id: "TX-A",
            actual_amount: "200",
            total_refunded: "25",
          },
          {
            id: 2,
            transaction_id: "TX-B",
            actual_amount: "250",
            total_refunded: "10",
          },
        ],
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "$",
    );
    expect(payload.amountPaid).toMatch(/415/);
    expect(payload.refundLine).toMatch(/35/);
  });
});

describe("buildGroupPaymentReceiptPayload for a cross-course group", () => {
  const tenant = { name: "SDEC", logo: null, timezone: "Asia/Yangon" };

  const groupRow = {
    id: "group-9",
    kind: "group" as const,
    group_id: 9,
    group_kind: "multi_course" as const,
    receipt_number: 41,
    user: { name: "Aung Aung" },
    course: { id: null, title: "Multiple" },
    courses: [
      { id: 1, title: "IELTS Morning" },
      { id: 2, title: "Business English" },
    ],
    parts: [
      {
        id: 1,
        course: { id: 1, title: "IELTS Morning" },
        base_amount: "200",
        discount_amount: "50",
        invoiced_amount: "150",
        actual_amount: "150",
        receipt_number: 41,
        transaction_id: "TXN-1",
        discount_lines: [{ label: "Early bird", amount: "50" }],
      },
      {
        id: 2,
        course: { id: 2, title: "Business English" },
        base_amount: "60",
        discount_amount: "10",
        invoiced_amount: "50",
        actual_amount: "50",
        receipt_number: 42,
        transaction_id: "TXN-1",
        discount_lines: [{ label: "Bulk", amount: "10" }],
      },
    ],
  };

  it("emits one course line per course, each with its own discount", () => {
    const payload = buildGroupPaymentReceiptPayload(groupRow, tenant, "$");
    expect(payload.courseLines?.map((line) => line.courseTitle)).toEqual([
      "IELTS Morning",
      "Business English",
    ]);
    expect(payload.courseLines?.[0]?.discountLines).toEqual([
      "Early bird (-$ 50)",
    ]);
    expect(payload.courseLines?.[1]?.discountLines).toEqual(["Bulk (-$ 10)"]);
  });

  it("labels the course row Multiple courses and totals the paid amount", () => {
    const payload = buildGroupPaymentReceiptPayload(groupRow, tenant, "$");
    expect(payload.courseTitle).toBe("Multiple courses");
    expect(payload.amountPaid).toBe("$ 200");
  });

  it("shows the group's shared receipt number", () => {
    const payload = buildGroupPaymentReceiptPayload(groupRow, tenant, "$");
    expect(payload.receiptNumber).toBe("41");
  });

  it("leaves courseLines null for a split-screenshot group on one course", () => {
    const payload = buildGroupPaymentReceiptPayload(
      {
        ...groupRow,
        group_kind: "split_screenshots",
        courses: [],
        course: { id: 1, title: "IELTS Morning" },
        parts: groupRow.parts.map((part) => ({
          ...part,
          course: { id: 1, title: "IELTS Morning" },
        })),
      },
      tenant,
      "$",
    );
    expect(payload.courseLines).toBeNull();
    expect(payload.courseTitle).toBe("IELTS Morning");
  });
});

describe("buildPaymentReceiptPayload progress fields", () => {
  it("reports payment ordinal and covered month count", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 172,
        payment_sequence: 2,
        covered_months: [
          { year: 2026, month_index: 10 },
          { year: 2026, month_index: 11 },
        ],
        term_total: "190000",
        paid_to_date: "190000",
        actual_amount: "95000",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "Ks ",
    );
    expect(payload.paymentSequence).toBe(2);
    expect(payload.monthsCoveredCount).toBe(2);
    expect(payload.termProgress).toMatch(/190,000/);
  });

  it("flags an overridden amount with the computed figure", () => {
    const payload = buildPaymentReceiptPayload(
      {
        id: 9,
        is_amount_overridden: true,
        computed_invoiced_amount: "190000",
        invoiced_amount: "150000",
        actual_amount: "150000",
      },
      { name: "Acme", logo: null, timezone: "UTC" },
      "Ks ",
    );
    expect(payload.adjustedNote).toMatch(/190,000/);
  });

  it("omits the adjusted note when the amount was not overridden", () => {
    const payload = buildPaymentReceiptPayload(
      { id: 9, computed_invoiced_amount: "190000", actual_amount: "190000" },
      { name: "Acme", logo: null, timezone: "UTC" },
      "Ks ",
    );
    expect(payload.adjustedNote).toBeNull();
  });
});

describe("downloadReceiptForPaymentRow", () => {
  const tenant = { name: "EC", logo: null, timezone: "UTC" };

  beforeEach(() => {
    makeGetRequest.mockReset();
    pdfToBlob.mockReset();
    downloadFile.mockReset();
    pdfToBlob.mockResolvedValue(new Blob(["pdf"]));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:receipt");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("routes a group stub through user-payment-groups enrichment", async () => {
    makeGetRequest.mockResolvedValue({
      data: {
        data: {
          id: "group-9",
          kind: "group",
          group_id: 9,
          status: UserPaymentStatus.verified,
          receipt_number: 41,
          parts: [
            {
              id: 11,
              course: { id: 1, title: "IELTS Morning" },
              actual_amount: "150",
            },
            {
              id: 12,
              course: { id: 2, title: "Business English" },
              actual_amount: "50",
            },
          ],
        },
      },
    });

    await downloadReceiptForPaymentRow(
      { id: "group-9", group_id: 9 },
      tenant,
      "$",
    );

    expect(makeGetRequest).toHaveBeenCalledWith("user-payment-groups/9");
    expect(makeGetRequest).not.toHaveBeenCalledWith(
      expect.stringMatching(/^user-payments\//),
    );
    expect(downloadFile).toHaveBeenCalled();
  });

  it("routes a standalone row through user-payments enrichment", async () => {
    makeGetRequest.mockResolvedValue({
      data: { data: { id: 183, receipt_number: 5, status: UserPaymentStatus.verified } },
    });

    await downloadReceiptForPaymentRow({ id: 183 }, tenant, "$");

    expect(makeGetRequest).toHaveBeenCalledWith("user-payments/183");
  });

  it("rejects a group that is not fully verified", async () => {
    makeGetRequest.mockResolvedValue({
      data: {
        data: {
          id: "group-9",
          status: UserPaymentStatus.pending_verification,
          parts: [],
        },
      },
    });

    await expect(
      downloadGroupPaymentReceipt({ id: "group-9", group_id: 9 }, tenant, "$"),
    ).rejects.toBeInstanceOf(ReceiptDownloadError);

    await expect(
      downloadGroupPaymentReceipt({ id: "group-9", group_id: 9 }, tenant, "$"),
    ).rejects.toMatchObject({ code: "group_not_fully_verified" });

    expect(downloadFile).not.toHaveBeenCalled();
  });
});
