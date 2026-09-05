import { searchEntities } from "@/app/client-api/utils";
import { operatorEnum } from "@/types/api";

export type ExpandedPaymentPlan =
  | number
  | {
      id?: number;
      price?: string | number | null;
      billing_type?: string | null;
    }
  | null
  | undefined;

/** True when the course has a billable payment plan (FK, id, or expanded price). */
export function courseHasBillablePaymentPlan(
  plan: ExpandedPaymentPlan,
): boolean {
  if (plan == null) return false;
  if (typeof plan === "number") return plan > 0;
  if (plan.id != null && plan.id > 0) return true;
  const price = plan.price;
  if (price == null) return false;
  const parsed = Number(price);
  return Number.isFinite(parsed) && parsed > 0;
}

export type UploadDiscountSectionView =
  | "hidden"
  | "loading"
  | "error"
  | "not_enrolled"
  | "picker";

export function resolveUploadDiscountSectionView({
  invalidContext,
  courseLoading,
  courseHasPaymentPlan,
  enrollmentLoading,
  enrollmentError,
  enrollmentId,
}: {
  invalidContext: boolean;
  courseLoading: boolean;
  courseHasPaymentPlan: boolean;
  enrollmentLoading: boolean;
  enrollmentError: boolean;
  enrollmentId: number | null | undefined;
}): UploadDiscountSectionView {
  if (invalidContext) return "hidden";
  if (courseLoading || !courseHasPaymentPlan) {
    if (courseLoading) return "loading";
    return "hidden";
  }
  if (enrollmentLoading) return "loading";
  if (enrollmentError) return "error";
  if (enrollmentId == null) return "not_enrolled";
  return "picker";
}

type EligibleDiscountCurrent = {
  discount?: number | null;
};

export function normalizeEligibleDiscountCurrents(
  current: EligibleDiscountCurrent | EligibleDiscountCurrent[] | null | undefined,
): EligibleDiscountCurrent[] {
  if (current == null) return [];
  return Array.isArray(current) ? current : [current];
}

export function currentDiscountTemplateIds(
  current: EligibleDiscountCurrent | EligibleDiscountCurrent[] | null | undefined,
): number[] {
  return normalizeEligibleDiscountCurrents(current)
    .map((ed) => ed.discount)
    .filter((id): id is number => id != null);
}

export const UPLOAD_ENROLLMENT_SEARCH_QUERY = {
  page: 1,
  size: 1,
  sorts: [] as string[],
} as const;

export async function searchUploadEnrollment(
  userId: string,
  courseId: string,
): Promise<{ id: number } | null> {
  const res = await searchEntities(
    "user-courses",
    UPLOAD_ENROLLMENT_SEARCH_QUERY,
    {
      filter_params: [
        {
          field_name: "user",
          operator: operatorEnum.exact,
          value: String(userId.trim()),
        },
        {
          field_name: "course",
          operator: operatorEnum.exact,
          value: String(courseId.trim()),
        },
        {
          field_name: "assigned_as",
          operator: operatorEnum.exact,
          value: "student",
        },
      ],
      exclude_params: [],
    },
  );

  if (res.data?.isError) {
    const details =
      typeof res.data.details === "string"
        ? res.data.details
        : res.data.message;
    throw new Error(details ?? "Could not load enrollment.");
  }

  const rows = res.data?.data;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0] as { id?: number };
  if (row.id == null) return null;
  return { id: row.id };
}
