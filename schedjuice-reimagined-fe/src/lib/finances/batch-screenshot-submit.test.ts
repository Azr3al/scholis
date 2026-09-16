import { describe, expect, it, vi } from "vitest";

import { submitBatchScreenshots } from "@/lib/finances/batch-screenshot-submit";

describe("submitBatchScreenshots", () => {
  it("submits parts sequentially and includes ocr_event_id", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: { data: ["ok"] } })
      .mockRejectedValueOnce(new Error("boom"));

    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const base = {
      file,
      studentId: "1",
      courseId: "9",
      issuedAtIso: "2026-09-01T00:00:00.000Z",
      transactionId: "txn-1",
      parsedAmount: "1000",
      paymentMethodId: "2",
      dateOnScreenshot: "",
      description: "notes",
      remarks: "",
      ocrEventId: "evt-1",
    };

    const result = await submitBatchScreenshots([base, { ...base, ocrEventId: "evt-2" }], post);

    expect(post).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toEqual([{ index: 1, message: "boom" }]);

    const firstForm = post.mock.calls[0][1] as FormData;
    expect(firstForm.get("ocr_event_id")).toBe("evt-1");
    expect(firstForm.get("transaction_id")).toBe("txn-1");
    expect(firstForm.get("user")).toBe("1");
    expect(firstForm.get("course")).toBe("9");
  });
});
