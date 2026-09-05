"use client";
import { Skeleton } from "@/components/primitives";

import { StudentPaymentsReportShell } from "@/components/finances/student-payments-report-shell";
import { useCourseHub } from "@/contexts/course-hub-context";
import { UserPaymentStatus } from "@/types/finance";

/** Row shape from `user-payments/admin-report` `data` array. */
export type StudentPaymentAdminReportRow = {
  id: number | string;
  user?: { id?: number; name?: string; email?: string } | null;
  course?: {
    id?: number;
    title?: string;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
  transaction_id?: string | null;
  receipt_number?: number | null;
  status: UserPaymentStatus;
  description?: string | null;
  remarks?: string | null;
  billing_start_date?: string | null;
  billing_end_date?: string | null;
  date_on_screenshot?: string | null;
  payment_method?: {
    id?: number | null;
    name?: string | null;
    payment_bank?: string | null;
  } | null;
  parsed_amount?: string | null;
  base_amount?: string | number | null;
  discount_amount?: string | number | null;
  invoiced_amount?: string | number | null;
  actual_amount?: string | number | null;
  discount_label?: string | null;
  discount_lines?: Array<{
    enrollment_discount_id?: number | null;
    label?: string | null;
    amount?: string | number | null;
  }> | null;
  /** Term fee minus verified payments for this student–course (admin report only). */
  remaining_amount?: string | number | null;
  screenshot?: string | null;
  microsoft_submission_id?: string | null;
  created_by?: {
    name?: string | null;
    id?: number | null;
    user_signature_url?: string | null;
  } | null;
  verified_by?: {
    name?: string | null;
    id?: number | null;
    user_signature_url?: string | null;
  } | null;
  /** From `UserCourse` for this enrollment (admin report only). */
  is_removed?: boolean;
  dropped_out_date?: string | null;
  /** Admin report: calendar coverage when explicit rows exist. */
  issued_at?: string | null;
  payment_date?: string | null;
  created_at?: string | null;
  covered_months?: { year: number; month_index: number }[];
  /** More than one payment row for this student–course in this month view. */
  month_overlap_peer_count?: number;
  month_overlap_duplicate_coverage?: boolean;
  is_installment?: boolean;
  installment_percent?: string | null;
  installment_cumulative_percent?: string | null;
  installment_covered_through?: { year: number; month_index: number } | null;
  kind?: "payment" | "group";
  group_id?: number | null;
  group_kind?: "split_screenshots" | "multi_course" | null;
  courses?: { id: number; title: string }[];
  shared_screenshot_courses?: { id: number; title: string }[];
  part_count?: number;
  parts?: StudentPaymentAdminReportRow[];
  /** School-recorded refund / re-transfer entries on this payment. */
  adjustment_count?: number;
  /** Sum of refund-kind adjustment amounts for this payment (admin report only). */
  total_refunded?: string | null;
};

/** Matches `user-payments/admin-report` response `summary` from the backend. */
export type StudentPaymentsAdminReportSummary = {
  verified_total: string;
  unuploaded_count: number;
  uploaded_count: number;
  verified_count: number;
  row_count: number;
  removed_count: number;
  /** Course-scoped: enrolled students on the course (not dropped). Otherwise: distinct students in rows (non-dropped). */
  active_student_row_count: number;
};

/** Deep link + helpers for transaction lookup / return navigation. */
export {
  STUDENT_PAYMENTS_TRANSACTION_LOOKUP_PATH,
  safeBackHref,
  transactionDuplicatesHref,
} from "@/helpers/student-payments-transaction-lookup";

/** Matches GET `courses/:id/payment-assignment-month-status` response `data.status`. */
export enum PaymentAssignmentMonthUiStatus {
  Created = "created",
  NotApplicable = "not_applicable",
  Skipped = "skipped",
  Scheduled = "scheduled",
  ExpectedButMissing = "expected_but_missing",
  Missed = "missed",
}

export type StudentPaymentsCourseMeta = {
  id: number;
  title?: string;
  start_date?: string;
  end_date?: string;
};

/** Course payment plan from admin-report `course_payment_plan` (fee omitted without permission). */
export type StudentPaymentsCoursePaymentPlan = {
  id: number;
  name?: string | null;
  billing_type?: string | null;
  price?: string | null;
};

export type StudentPaymentsReportProps = {
  /** When set, filters are scoped to this course; URL `courseId` is ignored. */
  fixedCourseId?: string;
  /** Course details for the summary block when `fixedCourseId` is set. */
  courseMeta?: StudentPaymentsCourseMeta | null;
  verificationUploadHref?: string;
  /**
   * When true: admin-report filters only by transaction ID (exact) and optional status,
   * across all courses and months (no date or course scope).
   */
  globalTransactionLookup?: boolean;
};

/**
 * Student payments report — restores the dual view (DataSheet grid /
 * page-owned ResourceTable) behind `useGridViewPreference("student-payments")`.
 */
export function StudentPaymentsReport(props: StudentPaymentsReportProps) {
  return <StudentPaymentsReportShell {...props} />;
}

export function CourseStudentPaymentsReport() {
  const { courseId, course, isCourseLoading } = useCourseHub();

  if (isCourseLoading) {
    return (
      <div className="flex w-full flex-col gap-3" aria-busy="true">
        <Skeleton className="min-h-[120px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!course?.id) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        Course could not be loaded.
      </p>
    );
  }

  return (
    <StudentPaymentsReport
      fixedCourseId={courseId}
      courseMeta={{
        id: Number(course.id),
        title: typeof course.title === "string" ? course.title : undefined,
        start_date:
          typeof course.start_date === "string" ? course.start_date : undefined,
        end_date:
          typeof course.end_date === "string" ? course.end_date : undefined,
      }}
    />
  );
}
