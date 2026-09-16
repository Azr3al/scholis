// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BatchScreenshotPartRow } from "@/components/finances/payment-upload/batch-screenshot-part-row";
import { OCR_FIELD_EXTRACTING_MESSAGE } from "@/lib/finances/ocr-payment-screenshot";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

vi.mock("@/components/form/entity-combobox", () => ({
  default: ({
    loadingPlaceholder,
    loadingPlaceholderActive,
  }: {
    loadingPlaceholder?: string;
    loadingPlaceholderActive?: boolean;
  }) => (
    <div>
      {loadingPlaceholderActive && loadingPlaceholder ? (
        <span role="status">{loadingPlaceholder}</span>
      ) : null}
    </div>
  ),
}));

function part() {
  return {
    key: "p1",
    file: new File(["x"], "a.jpg", { type: "image/jpeg" }),
    previewUrl: "blob:preview",
    studentId: "",
    paymentMethodId: "",
    transactionId: "",
    parsedAmount: "",
    dateOnScreenshot: "",
    description: "",
    remarks: "",
    duplicateWarningId: null,
    studentMatchKind: "none" as const,
    studentMatchCandidates: [],
  };
}

const idleHandlers = {
  onPreviewClick: () => {},
  onStudentChange: () => {},
  onPaymentMethodChange: () => {},
  onTransactionIdChange: () => {},
  onParsedAmountChange: () => {},
  onDescriptionChange: () => {},
  onRemarksChange: () => {},
  onDateOnScreenshotChange: () => {},
};

describe("BatchScreenshotPartRow OCR loading", () => {
  it("shows extracting shimmer on empty OCR fields while loading", () => {
    render(
      <BatchScreenshotPartRow
        part={part()}
        ocrState={{ status: "loading", message: null, duplicatePaymentId: null }}
        studentOptions={[]}
        rosterLoading={false}
        {...idleHandlers}
      />,
    );

    const statuses = screen.getAllByRole("status");
    expect(
      statuses.filter((el) =>
        el.textContent?.includes(OCR_FIELD_EXTRACTING_MESSAGE),
      ).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("does not native-disable the student combobox while extracting so the shimmer can animate", () => {
    render(
      <BatchScreenshotPartRow
        part={part()}
        ocrState={{ status: "loading", message: null, duplicatePaymentId: null }}
        studentOptions={[]}
        rosterLoading={false}
        {...idleHandlers}
      />,
    );

    const comboboxes = screen.getAllByRole("combobox", { name: "Student name" });
    expect(comboboxes.length).toBeGreaterThan(0);
    for (const combobox of comboboxes) {
      expect(combobox.hasAttribute("disabled")).toBe(false);
      expect(combobox.getAttribute("aria-disabled")).toBe("true");
      expect(combobox.getAttribute("aria-busy")).toBe("true");
    }
  });
});
