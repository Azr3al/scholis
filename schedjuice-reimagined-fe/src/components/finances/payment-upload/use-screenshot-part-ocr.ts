"use client";

import * as React from "react";

import {
  OCR_READ_ERROR_MESSAGE,
  runPaymentScreenshotOcr,
  type OcrPaymentScreenshotResult,
} from "@/lib/finances/ocr-payment-screenshot";

export type ScreenshotPartOcrState = {
  status: "idle" | "loading" | "success" | "error";
  message: string | null;
  duplicatePaymentId: number | null;
};

const IDLE: ScreenshotPartOcrState = {
  status: "idle",
  message: null,
  duplicatePaymentId: null,
};

export function useScreenshotPartOcr() {
  const [stateByKey, setStateByKey] = React.useState<
    Record<string, ScreenshotPartOcrState>
  >({});
  const requestIds = React.useRef<Record<string, number>>({});

  const reset = React.useCallback((key: string) => {
    requestIds.current[key] = (requestIds.current[key] ?? 0) + 1;
    setStateByKey((prev) => ({ ...prev, [key]: IDLE }));
  }, []);

  const runOcr = React.useCallback(
    async (key: string, file: File): Promise<OcrPaymentScreenshotResult | null> => {
      const requestId = (requestIds.current[key] ?? 0) + 1;
      requestIds.current[key] = requestId;
      setStateByKey((prev) => ({
        ...prev,
        [key]: { status: "loading", message: null, duplicatePaymentId: null },
      }));

      try {
        const data = await runPaymentScreenshotOcr({ file });
        if (requestIds.current[key] !== requestId) return null;
        setStateByKey((prev) => ({
          ...prev,
          [key]: {
            status: "success",
            message: null,
            duplicatePaymentId: data.duplicateWarningId,
          },
        }));
        return data;
      } catch {
        if (requestIds.current[key] !== requestId) return null;
        setStateByKey((prev) => ({
          ...prev,
          [key]: {
            status: "error",
            message: OCR_READ_ERROR_MESSAGE,
            duplicatePaymentId: null,
          },
        }));
        return null;
      }
    },
    [],
  );

  const hasLoading = React.useMemo(
    () => Object.values(stateByKey).some((s) => s.status === "loading"),
    [stateByKey],
  );

  return { stateByKey, runOcr, reset, hasLoading };
}
