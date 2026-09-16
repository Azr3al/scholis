// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useScreenshotPartOcr } from "@/components/finances/payment-upload/use-screenshot-part-ocr";

const runPaymentScreenshotOcr = vi.fn();
vi.mock("@/lib/finances/ocr-payment-screenshot", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runPaymentScreenshotOcr: (...args: unknown[]) =>
    runPaymentScreenshotOcr(...args),
}));

const file = (name: string) => new File(["x"], name, { type: "image/png" });

describe("useScreenshotPartOcr", () => {
  beforeEach(() => {
    runPaymentScreenshotOcr.mockReset();
  });

  it("discards a stale response when a newer file was attached to the same part", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    runPaymentScreenshotOcr
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        transactionId: "SECOND",
        parsedAmount: "200",
        dateOnScreenshot: "2026-07-02",
        duplicateWarningId: null,
      });

    const { result } = renderHook(() => useScreenshotPartOcr());

    let firstPromise: Promise<unknown> = Promise.resolve(null);
    act(() => {
      firstPromise = result.current.runOcr("p1", file("a.png"));
    });
    let second: unknown;
    await act(async () => {
      second = await result.current.runOcr("p1", file("b.png"));
    });
    await act(async () => {
      resolveFirst({
        transactionId: "FIRST",
        parsedAmount: "100",
        dateOnScreenshot: "",
        duplicateWarningId: null,
      });
      await firstPromise;
    });

    expect(second).toMatchObject({ transactionId: "SECOND" });
    expect(await firstPromise).toBeNull();
    expect(result.current.stateByKey.p1?.status).toBe("success");
  });

  it("forwards courseId to runPaymentScreenshotOcr", async () => {
    runPaymentScreenshotOcr.mockResolvedValueOnce({
      ocrEventId: "evt",
      transactionId: "txn",
      parsedAmount: "100",
      dateOnScreenshot: "",
      duplicateWarningId: null,
      bank: "KPAY",
      suggestedPaymentMethodId: "1",
      notesText: "",
      suggestedStudentId: "",
      studentMatchKind: "none",
      studentMatchScore: null,
      studentMatchCandidates: [],
    });
    const { result } = renderHook(() => useScreenshotPartOcr());

    await act(async () => {
      await result.current.runOcr("p1", file("a.png"), { courseId: "7" });
    });

    expect(runPaymentScreenshotOcr).toHaveBeenCalledWith({
      file: expect.any(File),
      courseId: "7",
    });
  });

  it("reports a readable error and stops blocking submit when OCR fails", async () => {
    runPaymentScreenshotOcr.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useScreenshotPartOcr());

    await act(async () => {
      await result.current.runOcr("p1", file("a.png"));
    });

    expect(result.current.stateByKey.p1?.status).toBe("error");
    expect(result.current.stateByKey.p1?.message).toMatch(/auto-fill/i);
    expect(result.current.hasLoading).toBe(false);
  });
});
