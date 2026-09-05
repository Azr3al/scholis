import { describe, expect, it } from "vitest";

import { buildStudentCheckoutFormData } from "./student-checkout-form-data";

describe("buildStudentCheckoutFormData", () => {
  const file = new File(["x"], "proof.png", { type: "image/png" });

  it("uses legacy keys for single payment and single screenshot", () => {
    const fd = buildStudentCheckoutFormData({
      paymentIds: [101],
      screenshots: [
        {
          file,
          parsedAmount: "50000",
          paymentMethodId: "",
          transactionId: "TXN-1",
          ocrEventId: "evt-1",
        },
      ],
    });
    expect(fd.get("checkout")).toBeNull();
    expect(fd.get("id")).toBe("101");
    expect(fd.get("screenshot")).toBe(file);
    expect(fd.get("ocr_event_id")).toBe("evt-1");
  });

  it("uses checkout keys for multiple payments", () => {
    const fd = buildStudentCheckoutFormData({
      paymentIds: [101, 102],
      screenshots: [{ file, parsedAmount: "100000", paymentMethodId: "" }],
    });
    expect(fd.get("checkout")).toBe("1");
    expect(fd.get("payment_ids_count")).toBe("2");
    expect(fd.get("payment_id_0")).toBe("101");
    expect(fd.get("payment_id_1")).toBe("102");
    expect(fd.get("screenshots_count")).toBe("1");
    expect(fd.get("screenshot_0_screenshot")).toBe(file);
  });

  it("omits payment_method when empty", () => {
    const fd = buildStudentCheckoutFormData({
      paymentIds: [101, 102],
      screenshots: [{ file, parsedAmount: "", paymentMethodId: "" }],
    });
    expect(fd.get("screenshot_0_payment_method")).toBeNull();
  });
});
