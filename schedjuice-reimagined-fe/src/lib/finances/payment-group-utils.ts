export function sumPartAmounts(parts: { amount: number | null }[]): number {
  return parts.reduce((s, p) => s + (p.amount ?? 0), 0);
}

export type PaymentPartFormInput = {
  file?: File;
  parsedAmount: string;
  paymentMethodId: string;
  transactionId?: string;
  dateOnScreenshot?: string;
  paymentDateIso?: string;
  description?: string;
  remarks?: string;
  ocrEventId?: string;
};

export type MultiCoursePaymentCourseInput = {
  courseId: number;
  userId?: number;
  /** null means "leave the enrollment discount stack untouched". */
  discountIds: number[] | null;
  clearDiscount: boolean;
  autoEnroll?: boolean;
  coveredMonths?: { year: number; month_index: number }[];
  isInstallment?: boolean;
  installmentPercent?: string | null;
  installmentThroughMonth?: { year: number; month_index: number } | null;
};

function appendScreenshotToFormData(
  fd: FormData,
  index: number,
  part: PaymentPartFormInput,
): void {
  if (part.file) fd.append(`screenshot_${index}_screenshot`, part.file);
  fd.append(`screenshot_${index}_parsed_amount`, part.parsedAmount);
  fd.append(`screenshot_${index}_payment_method`, part.paymentMethodId);
  if (part.transactionId)
    fd.append(`screenshot_${index}_transaction_id`, part.transactionId);
  if (part.dateOnScreenshot)
    fd.append(`screenshot_${index}_date_on_screenshot`, part.dateOnScreenshot);
  if (part.paymentDateIso)
    fd.append(`screenshot_${index}_payment_date`, part.paymentDateIso);
  if (part.description)
    fd.append(`screenshot_${index}_description`, part.description);
  if (part.remarks) fd.append(`screenshot_${index}_remarks`, part.remarks);
}

function appendPartToFormData(
  fd: FormData,
  index: number,
  part: PaymentPartFormInput,
): void {
  if (part.file) fd.append(`part_${index}_screenshot`, part.file);
  fd.append(`part_${index}_parsed_amount`, part.parsedAmount);
  fd.append(`part_${index}_payment_method`, part.paymentMethodId);
  if (part.transactionId)
    fd.append(`part_${index}_transaction_id`, part.transactionId);
  if (part.dateOnScreenshot)
    fd.append(`part_${index}_date_on_screenshot`, part.dateOnScreenshot);
  if (part.paymentDateIso)
    fd.append(`part_${index}_payment_date`, part.paymentDateIso);
  if (part.description)
    fd.append(`part_${index}_description`, part.description);
  if (part.remarks) fd.append(`part_${index}_remarks`, part.remarks);
  if (part.ocrEventId) fd.append(`part_${index}_ocr_event_id`, part.ocrEventId);
}

export function buildMultiPartPaymentFormData(args: {
  userId: number;
  courseId: number;
  planFields: Record<string, string>;
  parts: PaymentPartFormInput[];
}): FormData {
  const fd = new FormData();
  fd.append("user", String(args.userId));
  fd.append("course", String(args.courseId));
  for (const [k, v] of Object.entries(args.planFields)) {
    if (v !== undefined && v !== "") fd.append(k, v);
  }
  if (args.parts.length === 1) {
    const p = args.parts[0];
    if (p.file) fd.append("screenshot", p.file);
    fd.append("parsed_amount", p.parsedAmount);
    fd.append("payment_method", p.paymentMethodId);
    if (p.transactionId) fd.append("transaction_id", p.transactionId);
    if (p.dateOnScreenshot) fd.append("date_on_screenshot", p.dateOnScreenshot);
    if (p.paymentDateIso) fd.append("payment_date", p.paymentDateIso);
    if (p.description) fd.append("description", p.description);
    if (p.remarks) fd.append("remarks", p.remarks);
    if (p.ocrEventId) fd.append("ocr_event_id", p.ocrEventId);
    return fd;
  }
  fd.append("parts_count", String(args.parts.length));
  args.parts.forEach((p, i) => {
    appendPartToFormData(fd, i, p);
  });
  return fd;
}

export function buildMultiCoursePaymentFormData(args: {
  userId: number;
  planFields: Record<string, string>;
  courses: MultiCoursePaymentCourseInput[];
  screenshots: PaymentPartFormInput[];
  allocations: Array<{
    screenshotIndex: number;
    courseId: number;
    userId?: number;
    amount: number;
  }>;
}): FormData {
  const fd = new FormData();
  fd.append("user", String(args.userId));
  for (const [key, value] of Object.entries(args.planFields)) {
    if (value !== undefined && value !== "") fd.append(key, value);
  }

  fd.append("courses_count", String(args.courses.length));
  args.courses.forEach((course, index) => {
    fd.append(`course_${index}_id`, String(course.courseId));
    if (course.userId != null) {
      fd.append(`course_${index}_user`, String(course.userId));
    }
    if (course.discountIds && course.discountIds.length > 0) {
      for (const id of course.discountIds) {
        fd.append(`course_${index}_discount_ids`, String(id));
      }
    } else if (course.clearDiscount || course.discountIds?.length === 0) {
      fd.append(`course_${index}_clear_discount`, "true");
    }
    if (course.coveredMonths && course.coveredMonths.length > 0) {
      fd.append(
        `course_${index}_covered_months`,
        JSON.stringify(course.coveredMonths),
      );
    }
    if (course.isInstallment) {
      fd.append(`course_${index}_is_installment`, "true");
      if (course.installmentPercent) {
        fd.append(
          `course_${index}_installment_percent`,
          course.installmentPercent,
        );
      }
      if (course.installmentThroughMonth) {
        fd.append(
          `course_${index}_installment_through_month`,
          JSON.stringify(course.installmentThroughMonth),
        );
      }
    }
    if (course.autoEnroll) {
      fd.append(`course_${index}_auto_enroll`, "true");
    }
  });

  fd.append("screenshots_count", String(args.screenshots.length));
  args.screenshots.forEach((screenshot, index) => {
    appendScreenshotToFormData(fd, index, screenshot);
  });

  fd.append("allocations_count", String(args.allocations.length));
  args.allocations.forEach((allocation, index) => {
    fd.append(
      `alloc_${index}_screenshot_index`,
      String(allocation.screenshotIndex),
    );
    fd.append(`alloc_${index}_course_id`, String(allocation.courseId));
    if (allocation.userId != null) {
      fd.append(`alloc_${index}_user`, String(allocation.userId));
    }
    fd.append(`alloc_${index}_amount`, String(allocation.amount));
  });

  return fd;
}

export function hasDuplicateTransactionIds(
  ids: Array<string | undefined>,
): boolean {
  const present = ids.map((x) => x?.trim()).filter(Boolean) as string[];
  return new Set(present).size !== present.length;
}
