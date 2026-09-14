import { makePostRequest } from "@/app/client-api/utils";

export type BatchScreenshotSubmitPart = {
  file: File;
  studentId: string;
  courseId: string;
  issuedAtIso: string;
  transactionId: string;
  parsedAmount: string;
  paymentMethodId: string;
  dateOnScreenshot: string;
  description: string;
  remarks: string;
  ocrEventId?: string;
  createdById?: string;
};

export type BatchSubmitResult = {
  succeeded: number;
  failed: { index: number; message: string }[];
};

type PostFn = typeof makePostRequest;

export async function submitBatchScreenshots(
  parts: BatchScreenshotSubmitPart[],
  post: PostFn = makePostRequest,
): Promise<BatchSubmitResult> {
  const failed: { index: number; message: string }[] = [];
  let succeeded = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const formData = new FormData();
    formData.append("course", part.courseId);
    formData.append("issued_at", part.issuedAtIso);
    formData.append("user", part.studentId);
    formData.append("screenshot", part.file);
    if (part.transactionId) {
      formData.append("transaction_id", part.transactionId);
    }
    if (part.parsedAmount) {
      formData.append("parsed_amount", part.parsedAmount);
    }
    if (part.paymentMethodId) {
      formData.append("payment_method", part.paymentMethodId);
    }
    if (part.dateOnScreenshot) {
      formData.append("date_on_screenshot", part.dateOnScreenshot);
    }
    if (part.description) {
      formData.append("description", part.description);
    }
    if (part.remarks) {
      formData.append("remarks", part.remarks);
    }
    if (part.ocrEventId) {
      formData.append("ocr_event_id", part.ocrEventId);
    }
    if (part.createdById) {
      formData.append("created_by", part.createdById);
    }

    try {
      await post(
        "scan-transaction-screenshots",
        formData,
        {},
        { "Content-Type": "multipart/form-data" },
      );
      succeeded += 1;
    } catch (err) {
      failed.push({
        index: i,
        message: err instanceof Error ? err.message : "Submit failed",
      });
    }
  }

  return { succeeded, failed };
}
