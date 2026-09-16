import { describe, expect, it } from "vitest";

import { DefaultStudentPaymentPlan } from "@/types/organization";
import {
  findDuplicateTransactionIdPartKeys,
  getFirstUploadErrorFieldName,
  UPLOAD_PART_ERROR_MESSAGES,
  validateUploadForm,
  validateUploadParts,
  validateUploadPlan,
} from "./upload-part-validation";

const alwaysValidId = () => true;
const neverValidId = () => false;

describe("validateUploadParts", () => {
  it("flags missing screenshot, amount, and payment method", () => {
    const errors = validateUploadParts(
      [
        {
          key: "part-1",
          hasFile: false,
          parsedAmount: "",
          paymentMethodId: "",
          transactionId: "",
        },
      ],
      alwaysValidId,
    );
    expect(errors["part-1"]).toEqual({
      screenshot: UPLOAD_PART_ERROR_MESSAGES.screenshot,
      parsedAmount: UPLOAD_PART_ERROR_MESSAGES.parsedAmount,
      paymentMethodId: UPLOAD_PART_ERROR_MESSAGES.paymentMethodId,
    });
  });

  it("marks duplicate transaction IDs on every conflicting part", () => {
    const errors = validateUploadParts(
      [
        {
          key: "part-1",
          hasFile: true,
          parsedAmount: "100",
          paymentMethodId: "1",
          transactionId: "ABC",
        },
        {
          key: "part-2",
          hasFile: true,
          parsedAmount: "200",
          paymentMethodId: "1",
          transactionId: " abc ",
        },
      ],
      alwaysValidId,
    );
    expect(errors["part-1"]?.transactionId).toBe(
      UPLOAD_PART_ERROR_MESSAGES.transactionIdDuplicate,
    );
    expect(errors["part-2"]?.transactionId).toBe(
      UPLOAD_PART_ERROR_MESSAGES.transactionIdDuplicate,
    );
  });

  it("rejects invalid payment method ids", () => {
    const errors = validateUploadParts(
      [
        {
          key: "part-1",
          hasFile: true,
          parsedAmount: "10",
          paymentMethodId: "bad",
          transactionId: "",
        },
      ],
      neverValidId,
    );
    expect(errors["part-1"]?.paymentMethodId).toBe(
      UPLOAD_PART_ERROR_MESSAGES.paymentMethodId,
    );
  });

  it("allows missing screenshot when skipScreenshot is true", () => {
    const errors = validateUploadParts(
      [
        {
          key: "part-1",
          hasFile: false,
          skipScreenshot: true,
          parsedAmount: "100",
          paymentMethodId: "1",
          transactionId: "",
        },
      ],
      alwaysValidId,
    );
    expect(errors["part-1"]?.screenshot).toBeUndefined();
  });
});

describe("findDuplicateTransactionIdPartKeys", () => {
  it("ignores blank transaction IDs", () => {
    expect(
      findDuplicateTransactionIdPartKeys([
        {
          key: "a",
          hasFile: true,
          parsedAmount: "1",
          paymentMethodId: "1",
          transactionId: "",
        },
        {
          key: "b",
          hasFile: true,
          parsedAmount: "1",
          paymentMethodId: "1",
          transactionId: "  ",
        },
      ]),
    ).toEqual([]);
  });
});

describe("validateUploadPlan", () => {
  it("requires at least one month for multi-month plans", () => {
    expect(
      validateUploadPlan({
        paymentPlan: DefaultStudentPaymentPlan.multiple_months,
        multipleMonthsSelectedCount: 0,
        installmentThroughKey: "",
        selectableMonthKeys: ["2026-7"],
      }),
    ).toBe(UPLOAD_PART_ERROR_MESSAGES.planMultipleMonths);
  });

  it("requires a valid installment through month", () => {
    expect(
      validateUploadPlan({
        paymentPlan: DefaultStudentPaymentPlan.installment,
        multipleMonthsSelectedCount: 0,
        installmentThroughKey: "",
        selectableMonthKeys: ["2026-7"],
      }),
    ).toBe(UPLOAD_PART_ERROR_MESSAGES.planInstallmentThrough);
  });
});

describe("validateUploadForm", () => {
  it("returns first field name for scrolling", () => {
    const result = validateUploadForm({
      parts: [
        {
          key: "part-1",
          hasFile: false,
          parsedAmount: "",
          paymentMethodId: "",
          transactionId: "",
        },
      ],
      partKeys: ["part-1"],
      hasOcrLoading: false,
      isValidPaymentMethodId: alwaysValidId,
      paymentPlan: DefaultStudentPaymentPlan.single_month,
      multipleMonthsSelectedCount: 1,
      installmentThroughKey: "",
      selectableMonthKeys: [],
    });
    expect(result.hasErrors).toBe(true);
    expect(result.firstErrorFieldName).toBe("screenshot-part-1");
  });

  it("validateUploadForm sets form error when OCR loading", () => {
    const result = validateUploadForm({
      parts: [
        {
          key: "p1",
          hasFile: true,
          parsedAmount: "100",
          paymentMethodId: "1",
          transactionId: "A",
        },
      ],
      partKeys: ["p1"],
      hasOcrLoading: true,
      isValidPaymentMethodId: () => true,
      paymentPlan: DefaultStudentPaymentPlan.single_month,
      multipleMonthsSelectedCount: 0,
      installmentThroughKey: "",
      selectableMonthKeys: [],
    });
    expect(result.errors.form).toBe(UPLOAD_PART_ERROR_MESSAGES.formOcrLoading);
    expect(result.firstErrorFieldName).toBe("upload-form-error");
  });
});

describe("getFirstUploadErrorFieldName", () => {
  it("walks parts in order", () => {
    expect(
      getFirstUploadErrorFieldName(
        {
          parts: {
            "part-2": {
              screenshot: UPLOAD_PART_ERROR_MESSAGES.screenshot,
            },
            "part-1": {
              parsedAmount: UPLOAD_PART_ERROR_MESSAGES.parsedAmount,
            },
          },
        },
        ["part-1", "part-2"],
      ),
    ).toBe("amount-part-1");
  });
});
