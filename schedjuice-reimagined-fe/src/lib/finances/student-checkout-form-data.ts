import type { PaymentPartFormInput } from "./payment-group-utils";

export function buildStudentCheckoutFormData(args: {
  paymentIds: number[];
  screenshots: PaymentPartFormInput[];
}): FormData {
  const fd = new FormData();
  const { paymentIds, screenshots } = args;

  if (paymentIds.length === 1 && screenshots.length === 1) {
    const screenshot = screenshots[0];
    fd.append("id", String(paymentIds[0]));
    if (screenshot.file) fd.append("screenshot", screenshot.file);
    if (screenshot.parsedAmount) fd.append("parsed_amount", screenshot.parsedAmount);
    if (screenshot.transactionId) fd.append("transaction_id", screenshot.transactionId);
    if (screenshot.dateOnScreenshot) {
      fd.append("date_on_screenshot", screenshot.dateOnScreenshot);
    }
    if (screenshot.ocrEventId) fd.append("ocr_event_id", screenshot.ocrEventId);
    if (screenshot.paymentMethodId) {
      fd.append("payment_method", screenshot.paymentMethodId);
    }
    return fd;
  }

  fd.append("checkout", "1");
  fd.append("payment_ids_count", String(paymentIds.length));
  paymentIds.forEach((id, index) => {
    fd.append(`payment_id_${index}`, String(id));
  });

  fd.append("screenshots_count", String(screenshots.length));
  screenshots.forEach((screenshot, index) => {
    const prefix = `screenshot_${index}_`;
    if (screenshot.file) fd.append(`${prefix}screenshot`, screenshot.file);
    if (screenshot.parsedAmount) {
      fd.append(`${prefix}parsed_amount`, screenshot.parsedAmount);
    }
    if (screenshot.transactionId) {
      fd.append(`${prefix}transaction_id`, screenshot.transactionId);
    }
    if (screenshot.dateOnScreenshot) {
      fd.append(`${prefix}date_on_screenshot`, screenshot.dateOnScreenshot);
    }
    if (screenshot.ocrEventId) {
      fd.append(`${prefix}ocr_event_id`, screenshot.ocrEventId);
    }
    if (screenshot.paymentMethodId) {
      fd.append(`${prefix}payment_method`, screenshot.paymentMethodId);
    }
  });

  return fd;
}
