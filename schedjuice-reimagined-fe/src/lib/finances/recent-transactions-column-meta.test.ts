import { describe, expect, it } from "vitest";
import { recentTransactionsColumnLayout } from "./recent-transactions-column-meta";

describe("recentTransactionsColumnLayout", () => {
  it("omits parsed_amount when user cannot verify", () => {
    const layout = recentTransactionsColumnLayout({
      canVerify: false,
      userUploadStrategy: false,
    });
    expect(layout.some((c) => c.id === "parsed_amount")).toBe(false);
  });

  it("inserts billing_start_date when userUploadStrategy is enabled", () => {
    const layout = recentTransactionsColumnLayout({
      canVerify: false,
      userUploadStrategy: true,
    });
    expect(layout.some((c) => c.id === "billing_start_date")).toBe(true);
    expect(layout.some((c) => c.id === "payment_method__name")).toBe(false);
    expect(layout.some((c) => c.id === "date_on_screenshot")).toBe(false);
  });

  it("places bank after payment account for non-user_upload tenants", () => {
    const layout = recentTransactionsColumnLayout({
      canVerify: false,
      userUploadStrategy: false,
    });
    const accountIdx = layout.findIndex((c) => c.id === "payment_method__name");
    const bankIdx = layout.findIndex(
      (c) => c.id === "payment_method__payment_bank",
    );
    expect(accountIdx).toBeGreaterThanOrEqual(0);
    expect(bankIdx).toBe(accountIdx + 1);
  });

  it("omits bank column for user_upload tenants", () => {
    const layout = recentTransactionsColumnLayout({
      canVerify: false,
      userUploadStrategy: true,
    });
    expect(layout.some((c) => c.id === "payment_method__payment_bank")).toBe(
      false,
    );
  });

  it("always appends actions column", () => {
    const layout = recentTransactionsColumnLayout({
      canVerify: false,
      userUploadStrategy: false,
    });
    const actions = layout.find((c) => c.id === "_actions");
    expect(actions).toMatchObject({
      contentRole: "action",
      align: "center",
      minWidth: "6.5rem",
    });
    expect(layout.at(-1)?.id).toBe("_actions");
  });
});
