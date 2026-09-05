import { DefaultStudentPaymentPlan } from "@/types/organization";
import { computeScrollDeltaForViewportTarget } from "@/lib/main-content-scroll";

type UploadPartInput = {
  key: string;
  hasFile: boolean;
  skipScreenshot?: boolean;
  parsedAmount: string;
  paymentMethodId: string;
  transactionId: string;
};

export type PartFieldKey =
  | "screenshot"
  | "paymentDate"
  | "paymentMethodId"
  | "parsedAmount"
  | "transactionId";

type PartFieldErrors = Partial<Record<PartFieldKey, string>>;

export type UploadFieldErrors = {
  parts: Record<string, PartFieldErrors>;
  plan?: string;
  form?: string;
};

export const UPLOAD_PART_ERROR_MESSAGES = {
  screenshot: "Add a screenshot.",
  parsedAmount: "Enter an amount greater than 0.",
  paymentMethodId: "Choose a payment method.",
  transactionIdDuplicate: "Transaction IDs must be unique.",
  planMultipleMonths: "Select at least one month.",
  planInstallmentThrough: "Select which month this payment is paid through.",
  formOcrLoading: "Wait for screenshot reading to finish.",
} as const;

export function fieldNameForPartField(
  partKey: string,
  field: PartFieldKey,
): string {
  switch (field) {
    case "screenshot":
      return `screenshot-${partKey}`;
    case "paymentDate":
      return `payment-date-${partKey}`;
    case "paymentMethodId":
      return `payment-method-${partKey}`;
    case "parsedAmount":
      return `amount-${partKey}`;
    case "transactionId":
      return `transaction-id-${partKey}`;
  }
}

const PART_FIELD_ORDER: PartFieldKey[] = [
  "screenshot",
  "paymentDate",
  "paymentMethodId",
  "parsedAmount",
  "transactionId",
];

export function findDuplicateTransactionIdPartKeys(
  parts: UploadPartInput[],
): string[] {
  const normalized = parts.map((part) => ({
    key: part.key,
    id: part.transactionId.trim().toLowerCase(),
  }));
  const counts = new Map<string, number>();
  for (const { id } of normalized) {
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const duplicateIds = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
  );
  return normalized
    .filter((part) => part.id && duplicateIds.has(part.id))
    .map((part) => part.key);
}

export function validateUploadParts(
  parts: UploadPartInput[],
  isValidPaymentMethodId: (id: string) => boolean,
): Record<string, PartFieldErrors> {
  const partErrors: Record<string, PartFieldErrors> = {};

  for (const part of parts) {
    const errors: PartFieldErrors = {};
    if (!part.skipScreenshot && !part.hasFile) {
      errors.screenshot = UPLOAD_PART_ERROR_MESSAGES.screenshot;
    }
    const amount = Number.parseFloat(part.parsedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.parsedAmount = UPLOAD_PART_ERROR_MESSAGES.parsedAmount;
    }
    const paymentMethod = part.paymentMethodId.trim();
    if (!paymentMethod || !isValidPaymentMethodId(paymentMethod)) {
      errors.paymentMethodId = UPLOAD_PART_ERROR_MESSAGES.paymentMethodId;
    }
    if (Object.keys(errors).length > 0) {
      partErrors[part.key] = errors;
    }
  }

  for (const partKey of findDuplicateTransactionIdPartKeys(parts)) {
    partErrors[partKey] = {
      ...partErrors[partKey],
      transactionId: UPLOAD_PART_ERROR_MESSAGES.transactionIdDuplicate,
    };
  }

  return partErrors;
}

type ValidateUploadPlanInput = {
  paymentPlan:
    | DefaultStudentPaymentPlan.single_month
    | DefaultStudentPaymentPlan.multiple_months
    | DefaultStudentPaymentPlan.installment;
  multipleMonthsSelectedCount: number;
  installmentThroughKey: string;
  selectableMonthKeys: string[];
};

export function validateUploadPlan(
  input: ValidateUploadPlanInput,
): string | undefined {
  if (input.paymentPlan === DefaultStudentPaymentPlan.multiple_months) {
    if (input.multipleMonthsSelectedCount === 0) {
      return UPLOAD_PART_ERROR_MESSAGES.planMultipleMonths;
    }
  }
  if (input.paymentPlan === DefaultStudentPaymentPlan.installment) {
    const through = input.installmentThroughKey.trim();
    if (!through || !input.selectableMonthKeys.includes(through)) {
      return UPLOAD_PART_ERROR_MESSAGES.planInstallmentThrough;
    }
  }
  return undefined;
}

export function validateUploadForm(args: {
  parts: UploadPartInput[];
  partKeys: string[];
  hasOcrLoading: boolean;
  isValidPaymentMethodId: (id: string) => boolean;
  paymentPlan: ValidateUploadPlanInput["paymentPlan"];
  multipleMonthsSelectedCount: number;
  installmentThroughKey: string;
  selectableMonthKeys: string[];
}): {
  errors: UploadFieldErrors;
  hasErrors: boolean;
  firstErrorFieldName: string | null;
} {
  const errors: UploadFieldErrors = {
    parts: validateUploadParts(args.parts, args.isValidPaymentMethodId),
  };

  if (args.hasOcrLoading) {
    errors.form = UPLOAD_PART_ERROR_MESSAGES.formOcrLoading;
  }

  const planError = validateUploadPlan({
    paymentPlan: args.paymentPlan,
    multipleMonthsSelectedCount: args.multipleMonthsSelectedCount,
    installmentThroughKey: args.installmentThroughKey,
    selectableMonthKeys: args.selectableMonthKeys,
  });
  if (planError) {
    errors.plan = planError;
  }

  const hasErrors =
    Boolean(errors.form) ||
    Boolean(errors.plan) ||
    Object.keys(errors.parts).length > 0;

  return {
    errors,
    hasErrors,
    firstErrorFieldName: getFirstUploadErrorFieldName(errors, args.partKeys),
  };
}

export function getFirstUploadErrorFieldName(
  errors: UploadFieldErrors,
  partKeys: string[],
): string | null {
  if (errors.form) return "upload-form-error";
  if (errors.plan) return "upload-plan-error";

  for (const partKey of partKeys) {
    const partErrors = errors.parts[partKey];
    if (!partErrors) continue;
    for (const field of PART_FIELD_ORDER) {
      if (partErrors[field]) {
        return fieldNameForPartField(partKey, field);
      }
    }
  }

  return null;
}

export function scrollToFirstUploadError(fieldName: string | null): void {
  if (!fieldName) return;

  const target =
    document.querySelector(`[data-field-name="${fieldName}"]`) ??
    document.querySelector(`[name="${fieldName}"]`);
  if (!(target instanceof HTMLElement)) return;

  const main = document.getElementById("main-content");
  if (main) {
    const delta = computeScrollDeltaForViewportTarget(
      target.getBoundingClientRect().top,
      window.innerHeight,
    );
    if (delta != null) {
      main.scrollTo({
        top: Math.max(0, main.scrollTop + delta),
        behavior: "auto",
      });
      main.dispatchEvent(new Event("scroll"));
    }
  } else {
    target.scrollIntoView({ behavior: "auto", block: "center" });
  }

  const focusable = target.querySelector<HTMLElement>(
    "input, button, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
  focusable?.focus({ preventScroll: true });
}
