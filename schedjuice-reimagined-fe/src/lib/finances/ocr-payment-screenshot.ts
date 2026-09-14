import { makePostRequest } from "@/app/client-api/utils";

export enum PaymentScreenshotKind {
  Student = "student",
  Staff = "staff",
}

export type OcrStudentMatchCandidate = {
  id: number;
  name: string;
  score: number;
};

export type OcrPaymentScreenshotResult = {
  ocrEventId: string;
  transactionId: string;
  parsedAmount: string;
  dateOnScreenshot: string;
  duplicateWarningId: number | null;
  bank: string;
  suggestedPaymentMethodId: string;
  notesText: string;
  suggestedStudentId: string;
  studentMatchKind: "auto" | "candidates" | "none";
  studentMatchScore: number | null;
  studentMatchCandidates: OcrStudentMatchCandidate[];
};

export type OcrPaymentScreenshotStatus = "idle" | "loading" | "success" | "error";

export const OCR_READ_ERROR_MESSAGE =
  "Auto-fill didn't catch every detail. Please review or complete the fields below.";

export const OCR_FIELD_EXTRACTING_MESSAGE = "trying to extract...";

export function parseOcrString(value: unknown): string {
  return value == null ? "" : String(value);
}

export function parseDuplicatePaymentId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseSuggestedPaymentMethodId(value: unknown): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : "";
}

export function parseOcrStudentMatch(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.student_match_candidates)
    ? payload.student_match_candidates
    : [];
  const kind = payload.student_match_kind;
  const studentMatchKind: OcrPaymentScreenshotResult["studentMatchKind"] =
    kind === "auto" || kind === "candidates" || kind === "none"
      ? kind
      : "none";

  return {
    notesText: parseOcrString(payload.notes_text),
    suggestedStudentId: parseOcrString(payload.suggested_student_id),
    studentMatchKind,
    studentMatchScore:
      payload.student_match_score == null
        ? null
        : Number(payload.student_match_score),
    studentMatchCandidates: candidates
      .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
      .map((c) => ({
        id: Number(c.id),
        name: parseOcrString(c.name),
        score: Number(c.score),
      })),
  };
}

type OcrPayload = {
  ocr_event_id?: unknown;
  transaction_id?: unknown;
  parsed_amount?: unknown;
  date_on_screenshot?: unknown;
  duplicate_of_payment_id?: unknown;
  bank?: unknown;
  suggested_payment_method_id?: unknown;
};

function normalizeOcrPayload(body: unknown): OcrPayload {
  if (!body || typeof body !== "object") return {};
  const record = body as {
    isError?: boolean;
    message?: string;
    data?: unknown;
    transaction_id?: unknown;
    parsed_amount?: unknown;
    date_on_screenshot?: unknown;
    duplicate_of_payment_id?: unknown;
    bank?: unknown;
    suggested_payment_method_id?: unknown;
  };
  if (record.isError) {
    throw new Error(record.message ?? "Could not read this screenshot.");
  }
  if (record.data && typeof record.data === "object") {
    return record.data as OcrPayload;
  }
  return record;
}

export async function runPaymentScreenshotOcr(args: {
  file: File;
  paymentKind?: PaymentScreenshotKind;
  courseId?: string;
}): Promise<OcrPaymentScreenshotResult> {
  const formData = new FormData();
  formData.append("screenshot", args.file);
  if (args.paymentKind === PaymentScreenshotKind.Staff) {
    formData.append("payment_kind", PaymentScreenshotKind.Staff);
  }
  if (args.courseId) {
    formData.append("course_id", args.courseId);
  }

  const res = await makePostRequest(
    "ocr-payment-screenshot",
    formData,
    {},
    { "Content-Type": "multipart/form-data" },
  );

  const payload = normalizeOcrPayload(res.data);

  return {
    ocrEventId: parseOcrString(payload.ocr_event_id),
    transactionId: parseOcrString(payload.transaction_id),
    parsedAmount: parseOcrString(payload.parsed_amount),
    dateOnScreenshot: parseOcrString(payload.date_on_screenshot),
    duplicateWarningId: parseDuplicatePaymentId(payload.duplicate_of_payment_id),
    bank: parseOcrString(payload.bank),
    suggestedPaymentMethodId: parseSuggestedPaymentMethodId(
      payload.suggested_payment_method_id,
    ),
    ...parseOcrStudentMatch(payload as Record<string, unknown>),
  };
}

export function getFirstLocalImageFile(
  files: readonly {
    file?: File;
    is_image?: boolean;
    isRemoved?: boolean;
  }[],
): File | null {
  for (const file of files) {
    if (!file.file || file.isRemoved || !file.is_image) continue;
    return file.file;
  }
  return null;
}
