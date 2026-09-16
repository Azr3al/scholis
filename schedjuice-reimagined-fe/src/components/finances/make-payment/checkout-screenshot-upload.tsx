"use client";

import FileDragAndDrop, {
  extendedFileType,
} from "@/components/form/file-drag-and-drop";
import { PaymentScreenshotPreview } from "@/components/finances/payment-screenshot-preview";
import {
  PaymentScreenshotKind,
  runPaymentScreenshotOcr,
} from "@/lib/finances/ocr-payment-screenshot";
import { Button } from "@/components/primitives";
import { crossfadeInstant, crossfadeOpacity } from "@/lib/sj/motion";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";

export type CheckoutScreenshot = {
  key: string;
  files: extendedFileType[];
  ocrEventId?: string;
  transactionId?: string;
  parsedAmount?: string;
  dateOnScreenshot?: string;
  suggestedPaymentMethodId?: string;
};

let checkoutScreenshotKeySequence = 0;

function createCheckoutScreenshot(): CheckoutScreenshot {
  checkoutScreenshotKeySequence += 1;
  return {
    key: `checkout-screenshot-${checkoutScreenshotKeySequence}`,
    files: [],
  };
}

function getLocalFile(screenshot: CheckoutScreenshot): File | null {
  const first = screenshot.files[0];
  return first && "file" in first ? first.file : null;
}

type CheckoutScreenshotUploadProps = {
  screenshots: CheckoutScreenshot[];
  onChange: (
    next:
      | CheckoutScreenshot[]
      | ((current: CheckoutScreenshot[]) => CheckoutScreenshot[]),
  ) => void;
  disabled?: boolean;
};

export function CheckoutScreenshotUpload({
  screenshots,
  onChange,
  disabled = false,
}: CheckoutScreenshotUploadProps) {
  const reducedMotion = useReducedMotion();
  const rowPresence = reducedMotion ? crossfadeInstant : crossfadeOpacity;
  const ocrRequestIdsRef = useRef<Record<string, number>>({});
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const runHiddenOcr = useCallback(
    async (screenshotKey: string, file: File) => {
      const requestId = (ocrRequestIdsRef.current[screenshotKey] ?? 0) + 1;
      ocrRequestIdsRef.current[screenshotKey] = requestId;
      try {
        const result = await runPaymentScreenshotOcr({
          file,
          paymentKind: PaymentScreenshotKind.Student,
        });
        if (ocrRequestIdsRef.current[screenshotKey] !== requestId) return;
        onChange((current) =>
          current.map((row) =>
            row.key === screenshotKey
              ? {
                  ...row,
                  ocrEventId: result.ocrEventId,
                  transactionId: result.transactionId,
                  parsedAmount: result.parsedAmount,
                  dateOnScreenshot: result.dateOnScreenshot,
                  suggestedPaymentMethodId: result.suggestedPaymentMethodId,
                }
              : row,
          ),
        );
      } catch {
        // Silent for students — submit without OCR metadata.
      }
    },
    [onChange],
  );

  const updateScreenshot = (
    screenshotKey: string,
    updater: (row: CheckoutScreenshot) => CheckoutScreenshot,
  ) => {
    onChange((current) =>
      current.map((row) => (row.key === screenshotKey ? updater(row) : row)),
    );
  };

  const handleFilesChange = (screenshotKey: string, files: extendedFileType[]) => {
    updateScreenshot(screenshotKey, (row) => ({ ...row, files }));
    const file = files[0] && "file" in files[0] ? files[0].file : null;
    if (file) {
      void runHiddenOcr(screenshotKey, file);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="font-serif text-xl text-text-primary">Upload transfer proof</p>
        <p className="mt-1 text-sm text-text-muted">
          Include the transaction ID in your screenshot if you can.
        </p>
      </div>

      <AnimatePresence initial={false}>
        {screenshots.map((screenshot) => (
          <motion.div
            key={screenshot.key}
            variants={rowPresence}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-2"
          >
            <FileDragAndDrop
              className="w-full min-w-0"
              isMultiple={false}
              label=""
              labelClassName="sr-only"
              maxFiles={1}
              files={screenshot.files}
              setFiles={(files) => handleFilesChange(screenshot.key, files)}
              showCarousel={false}
              showSelectedFiles={false}
              showSelectionCount={false}
              isReadOnly={disabled}
              isButtonDisabled={disabled}
              density="compact"
            />
            <PaymentScreenshotPreview
              file={screenshot.files[0]}
              onView={setViewerUrl}
              onClear={() => handleFilesChange(screenshot.key, [])}
              clearDisabled={disabled}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => onChange((current) => [...current, createCheckoutScreenshot()])}
      >
        Add another screenshot
      </Button>

      <FullScreenImageViewer
        imageUrl={viewerUrl}
        onClose={() => setViewerUrl(null)}
      />
    </div>
  );
}

export function createInitialCheckoutScreenshots(): CheckoutScreenshot[] {
  return [createCheckoutScreenshot()];
}

export function checkoutScreenshotToPartInput(
  screenshot: CheckoutScreenshot,
): {
  file?: File;
  parsedAmount: string;
  paymentMethodId: string;
  transactionId?: string;
  dateOnScreenshot?: string;
  ocrEventId?: string;
} {
  const file = getLocalFile(screenshot);
  return {
    file: file ?? undefined,
    parsedAmount: screenshot.parsedAmount ?? "",
    paymentMethodId: screenshot.suggestedPaymentMethodId ?? "",
    transactionId: screenshot.transactionId,
    dateOnScreenshot: screenshot.dateOnScreenshot,
    ocrEventId: screenshot.ocrEventId,
  };
}
