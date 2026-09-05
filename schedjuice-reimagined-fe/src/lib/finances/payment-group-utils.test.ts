import { describe, expect, it } from "vitest";

import {
  buildMultiCoursePaymentFormData,
  buildMultiPartPaymentFormData,
  hasDuplicateTransactionIds,
  sumPartAmounts,
} from "./payment-group-utils";

describe("sumPartAmounts", () => {
  it("sums amounts and treats null as zero", () => {
    expect(
      sumPartAmounts([
        { amount: 100 },
        { amount: null },
        { amount: 50 },
      ]),
    ).toBe(150);
  });

  it("returns zero for empty parts", () => {
    expect(sumPartAmounts([])).toBe(0);
  });
});

describe("buildMultiPartPaymentFormData", () => {
  const file1 = new File(["a"], "part1.png", { type: "image/png" });
  const file2 = new File(["b"], "part2.png", { type: "image/png" });

  it("appends payment_date for single-part upload", () => {
    const fd = buildMultiPartPaymentFormData({
      userId: 10,
      courseId: 20,
      planFields: {},
      parts: [
        {
          file: file1,
          parsedAmount: "50000",
          paymentMethodId: "3",
          paymentDateIso: "2026-03-15T00:00:00.000Z",
        },
      ],
    });

    expect(fd.get("payment_date")).toBe("2026-03-15T00:00:00.000Z");
  });

  it("appends ocr_event_id for single-part upload", () => {
    const fd = buildMultiPartPaymentFormData({
      userId: 10,
      courseId: 20,
      planFields: {},
      parts: [
        {
          file: file1,
          parsedAmount: "50000",
          paymentMethodId: "3",
          ocrEventId: "abc-123",
        },
      ],
    });

    expect(fd.get("ocr_event_id")).toBe("abc-123");
  });

  it("uses single-part keys when only one part", () => {
    const fd = buildMultiPartPaymentFormData({
      userId: 10,
      courseId: 20,
      planFields: { billing_start_date: "2026-01-01", empty_field: "" },
      parts: [
        {
          file: file1,
          parsedAmount: "50000",
          paymentMethodId: "3",
          transactionId: "TXN-1",
          dateOnScreenshot: "2026-01-15",
        },
      ],
    });

    expect(fd.get("user")).toBe("10");
    expect(fd.get("course")).toBe("20");
    expect(fd.get("billing_start_date")).toBe("2026-01-01");
    expect(fd.get("empty_field")).toBeNull();
    expect(fd.get("screenshot")).toBe(file1);
    expect(fd.get("parsed_amount")).toBe("50000");
    expect(fd.get("payment_method")).toBe("3");
    expect(fd.get("transaction_id")).toBe("TXN-1");
    expect(fd.get("date_on_screenshot")).toBe("2026-01-15");
    expect(fd.get("parts_count")).toBeNull();
    expect(fd.get("part_0_screenshot")).toBeNull();
  });

  it("uses indexed part keys for multi-part uploads", () => {
    const fd = buildMultiPartPaymentFormData({
      userId: 10,
      courseId: 20,
      planFields: {},
      parts: [
        {
          file: file1,
          parsedAmount: "30000",
          paymentMethodId: "1",
          transactionId: "TXN-A",
        },
        {
          file: file2,
          parsedAmount: "20000",
          paymentMethodId: "2",
          dateOnScreenshot: "2026-02-01",
        },
      ],
    });

    expect(fd.get("parts_count")).toBe("2");
    expect(fd.get("screenshot")).toBeNull();
    expect(fd.get("parsed_amount")).toBeNull();

    expect(fd.get("part_0_screenshot")).toBe(file1);
    expect(fd.get("part_0_parsed_amount")).toBe("30000");
    expect(fd.get("part_0_payment_method")).toBe("1");
    expect(fd.get("part_0_transaction_id")).toBe("TXN-A");
    expect(fd.get("part_0_date_on_screenshot")).toBeNull();

    expect(fd.get("part_1_screenshot")).toBe(file2);
    expect(fd.get("part_1_parsed_amount")).toBe("20000");
    expect(fd.get("part_1_payment_method")).toBe("2");
    expect(fd.get("part_1_transaction_id")).toBeNull();
    expect(fd.get("part_1_date_on_screenshot")).toBe("2026-02-01");
  });

  it("includes per-part description and remarks for multi-part", () => {
    const fd = buildMultiPartPaymentFormData({
      userId: 1,
      courseId: 2,
      planFields: {},
      parts: [
        {
          file: file1,
          parsedAmount: "10",
          paymentMethodId: "1",
          description: "a",
          remarks: "r1",
        },
        {
          file: file2,
          parsedAmount: "20",
          paymentMethodId: "2",
          description: "b",
          remarks: "r2",
        },
      ],
    });
    expect(fd.get("part_0_description")).toBe("a");
    expect(fd.get("part_0_remarks")).toBe("r1");
    expect(fd.get("part_1_description")).toBe("b");
    expect(fd.get("part_1_remarks")).toBe("r2");
  });

  it("includes description/remarks on single-part body", () => {
    const fd = buildMultiPartPaymentFormData({
      userId: 1,
      courseId: 2,
      planFields: {},
      parts: [
        {
          file: file1,
          parsedAmount: "10",
          paymentMethodId: "1",
          description: "solo",
          remarks: "note",
        },
      ],
    });
    expect(fd.get("description")).toBe("solo");
    expect(fd.get("remarks")).toBe("note");
  });

  it("omits screenshot key when single part has no file", () => {
    const fd = buildMultiPartPaymentFormData({
      userId: 10,
      courseId: 20,
      planFields: {},
      parts: [
        {
          parsedAmount: "50000",
          paymentMethodId: "3",
          paymentDateIso: "2026-03-15T00:00:00.000Z",
        },
      ],
    });

    expect(fd.get("screenshot")).toBeNull();
    expect(fd.get("parsed_amount")).toBe("50000");
    expect(fd.get("payment_method")).toBe("3");
    expect(fd.get("payment_date")).toBe("2026-03-15T00:00:00.000Z");
  });
});

describe("buildMultiCoursePaymentFormData", () => {
  const file = new File(["x"], "s.png", { type: "image/png" });
  const screenshot = {
    file,
    parsedAmount: "200",
    paymentMethodId: "7",
    transactionId: "TXN-1",
  };

  it("emits indexed course, screenshot and allocation fields", () => {
    const fd = buildMultiCoursePaymentFormData({
      userId: 3,
      planFields: { issued_at: "2026-07-01T00:00:00Z" },
      courses: [
        { courseId: 11, discountIds: [5, 6], clearDiscount: false },
        { courseId: 22, discountIds: null, clearDiscount: true },
      ],
      screenshots: [screenshot],
      allocations: [
        { screenshotIndex: 0, courseId: 11, amount: 150 },
        { screenshotIndex: 0, courseId: 22, amount: 50 },
      ],
    });

    expect(fd.get("user")).toBe("3");
    expect(fd.get("courses_count")).toBe("2");
    expect(fd.get("course_0_id")).toBe("11");
    expect(fd.getAll("course_0_discount_ids")).toEqual(["5", "6"]);
    expect(fd.get("course_1_clear_discount")).toBe("true");
    expect(fd.get("course_1_discount_ids")).toBeNull();
    expect(fd.get("screenshots_count")).toBe("1");
    expect(fd.get("screenshot_0_parsed_amount")).toBe("200");
    expect(fd.get("allocations_count")).toBe("2");
    expect(fd.get("alloc_1_course_id")).toBe("22");
    expect(fd.get("alloc_1_amount")).toBe("50");
    expect(fd.get("course")).toBeNull();
  });

  it("emits per-student course and allocation user fields", () => {
    const fd = buildMultiCoursePaymentFormData({
      userId: 3,
      planFields: {},
      courses: [
        { courseId: 11, userId: 3, discountIds: [], clearDiscount: true },
        { courseId: 22, userId: 4, discountIds: [], clearDiscount: true },
      ],
      screenshots: [screenshot],
      allocations: [
        { screenshotIndex: 0, courseId: 11, userId: 3, amount: 150 },
        { screenshotIndex: 0, courseId: 22, userId: 4, amount: 50 },
      ],
    });
    expect(fd.get("course_0_user")).toBe("3");
    expect(fd.get("course_1_user")).toBe("4");
    expect(fd.get("alloc_0_user")).toBe("3");
    expect(fd.get("alloc_1_user")).toBe("4");
  });

  it("omits an empty discount list rather than sending clear_discount", () => {
    const fd = buildMultiCoursePaymentFormData({
      userId: 3,
      planFields: {},
      courses: [{ courseId: 11, discountIds: [], clearDiscount: false }],
      screenshots: [screenshot],
      allocations: [{ screenshotIndex: 0, courseId: 11, amount: 200 }],
    });
    expect(fd.getAll("course_0_discount_ids")).toEqual([]);
    expect(fd.get("course_0_clear_discount")).toBe("true");
  });

  it("appends auto_enroll when set on a course", () => {
    const fd = buildMultiCoursePaymentFormData({
      userId: 3,
      planFields: {},
      courses: [
        { courseId: 1, discountIds: [], clearDiscount: true, autoEnroll: true },
        { courseId: 2, discountIds: [], clearDiscount: true },
      ],
      screenshots: [screenshot],
      allocations: [
        { screenshotIndex: 0, courseId: 1, amount: 60 },
        { screenshotIndex: 0, courseId: 2, amount: 40 },
      ],
    });
    expect(fd.get("course_0_auto_enroll")).toBe("true");
    expect(fd.get("course_1_auto_enroll")).toBeNull();
  });

  it("omits screenshot file key when screenshot has no file", () => {
    const fd = buildMultiCoursePaymentFormData({
      userId: 3,
      planFields: {},
      courses: [
        { courseId: 11, discountIds: [], clearDiscount: true },
        { courseId: 22, discountIds: [], clearDiscount: true },
      ],
      screenshots: [
        {
          parsedAmount: "200",
          paymentMethodId: "7",
        },
      ],
      allocations: [
        { screenshotIndex: 0, courseId: 11, amount: 150 },
        { screenshotIndex: 0, courseId: 22, amount: 50 },
      ],
    });

    expect(fd.get("screenshot_0_screenshot")).toBeNull();
    expect(fd.get("screenshot_0_parsed_amount")).toBe("200");
    expect(fd.get("screenshot_0_payment_method")).toBe("7");
  });
});

describe("hasDuplicateTransactionIds", () => {
  it("returns false when ids are unique or absent", () => {
    expect(hasDuplicateTransactionIds(["A", "B", undefined, ""])).toBe(false);
    expect(hasDuplicateTransactionIds([undefined, "", "  "])).toBe(false);
  });

  it("returns true when duplicate non-empty ids exist", () => {
    expect(hasDuplicateTransactionIds(["A", "A"])).toBe(true);
    expect(hasDuplicateTransactionIds([" A ", "A"])).toBe(true);
  });
});
