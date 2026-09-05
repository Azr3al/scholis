import { describe, expect, it } from "vitest";
import { isFinanceRecordRoute } from "./is-finance-record-route";

describe("isFinanceRecordRoute", () => {
  it("matches finances workspace routes", () => {
    expect(isFinanceRecordRoute("/finances")).toBe(true);
    expect(isFinanceRecordRoute("/finances/student-payments")).toBe(true);
    expect(isFinanceRecordRoute("/payment-plans")).toBe(true);
    expect(isFinanceRecordRoute("/payment-plans/create")).toBe(true);
    expect(isFinanceRecordRoute("/discounts/abc/edit")).toBe(true);
    expect(isFinanceRecordRoute("/payment-methods")).toBe(true);
    expect(isFinanceRecordRoute("/payment-infos")).toBe(true);
    expect(isFinanceRecordRoute("/screenshots/create")).toBe(true);
  });

  it("rejects unrelated routes", () => {
    expect(isFinanceRecordRoute("/courses")).toBe(false);
    expect(isFinanceRecordRoute("/users")).toBe(false);
    expect(isFinanceRecordRoute("/financesomething")).toBe(false);
  });
});
