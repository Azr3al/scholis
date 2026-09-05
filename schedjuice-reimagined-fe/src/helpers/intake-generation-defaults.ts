import { getDateISOString } from "@/helpers/date";
import type { intakeType, IntakeGenerationDefaults } from "@/types/intake";

export function parseIntakeGenerationDefaults(
  intake: intakeType,
): IntakeGenerationDefaults {
  const raw = intake.generation_defaults;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as IntakeGenerationDefaults;
}

export function resolveIntakeAddPaymentPlanId(
  intake: intakeType,
  defaultPaymentPlanId: number | undefined,
  rowPaymentPlanId: number | undefined,
): number | undefined {
  if (rowPaymentPlanId != null) return rowPaymentPlanId;
  if (defaultPaymentPlanId != null) return defaultPaymentPlanId;
  const intakePlanId = parseIntakeGenerationDefaults(intake).payment_plan_id;
  return intakePlanId ?? undefined;
}

export function applyIntakeExamDefaultsToPayload(
  payload: Record<string, unknown>,
  exam?: {
    exam_session_date?: string | null;
    exam_board?: string | null;
  },
  intakeDefaults?: IntakeGenerationDefaults,
): void {
  const session =
    exam?.exam_session_date ?? intakeDefaults?.exam_session_date ?? undefined;
  const board = exam?.exam_board ?? intakeDefaults?.exam_board ?? undefined;
  if (session) {
    const d = new Date(session);
    payload.exam_session_date = new Date(
      d.getFullYear(),
      d.getMonth(),
      1,
    ).toISOString();
  }
  if (board) {
    payload.exam_board = board;
  }
}

export function buildCoursePayloadFromIntakeDefaults(
  intake: intakeType,
  programId: number,
  row: {
    subject_id: number;
    title: string;
    payment_plan_id?: number;
    exam_session_date?: string | null;
    exam_board?: string | null;
  },
): Record<string, unknown> {
  const defaults = parseIntakeGenerationDefaults(intake);
  const startDate = defaults.start_date ?? intake.start_date;
  const endDate = defaults.end_date ?? intake.end_date;

  const payload: Record<string, unknown> = {
    title: row.title,
    program: programId,
    intake: intake.id,
    subject: row.subject_id,
    description: defaults.description ?? "",
    start_date: getDateISOString(new Date(startDate)),
    end_date: getDateISOString(new Date(endDate)),
  };

  if (defaults.category_id != null) {
    payload.category = defaults.category_id;
  }
  const paymentPlanId = row.payment_plan_id ?? defaults.payment_plan_id ?? undefined;
  if (paymentPlanId != null) {
    payload.payment_plan = paymentPlanId;
  }
  if (defaults.campus_id != null) {
    payload.campus = defaults.campus_id;
  }
  if (defaults.course_type != null) {
    payload.course_type = defaults.course_type;
  }
  if (defaults.is_payment_enabled != null) {
    payload.is_payment_enabled = defaults.is_payment_enabled;
  }
  applyIntakeExamDefaultsToPayload(payload, row, defaults);

  return payload;
}

export function buildMultiCoursePayloadFromIntakeDefaults(
  intake: intakeType,
  programId: number,
  row: {
    level_id: number;
    section_id?: number;
    title: string;
    category_id?: number;
    payment_plan_id?: number;
    exam_session_date?: string | null;
    exam_board?: string | null;
  },
): Record<string, unknown> {
  const defaults = parseIntakeGenerationDefaults(intake);
  const startDate = defaults.start_date ?? intake.start_date;
  const endDate = defaults.end_date ?? intake.end_date;

  const payload: Record<string, unknown> = {
    title: row.title,
    program: programId,
    intake: intake.id,
    level: row.level_id,
    description: defaults.description ?? "",
    start_date: getDateISOString(new Date(startDate)),
    end_date: getDateISOString(new Date(endDate)),
  };

  if (row.section_id != null) {
    payload.section = row.section_id;
  }

  const categoryId = row.category_id ?? defaults.category_id;
  if (categoryId != null) {
    payload.category = categoryId;
  }
  const paymentPlanId = row.payment_plan_id ?? defaults.payment_plan_id ?? undefined;
  if (paymentPlanId != null) {
    payload.payment_plan = paymentPlanId;
  }
  if (defaults.campus_id != null) {
    payload.campus = defaults.campus_id;
  }
  if (defaults.course_type != null) {
    payload.course_type = defaults.course_type;
  }
  if (defaults.is_payment_enabled != null) {
    payload.is_payment_enabled = defaults.is_payment_enabled;
  }
  applyIntakeExamDefaultsToPayload(payload, row, defaults);

  return payload;
}

export function getLevelDefaultCategoryId(
  level:
    | {
        default_category?: number | { id: number } | null;
      }
    | undefined,
): number | undefined {
  if (!level?.default_category) return undefined;
  if (typeof level.default_category === "number") {
    return level.default_category;
  }
  return level.default_category.id;
}

export function resolveMultiCourseCategoryId(
  intake: intakeType,
  level:
    | {
        default_category?: number | { id: number } | null;
      }
    | undefined,
  categoryOverride?: string,
): number | undefined {
  const intakeCategoryId = parseIntakeGenerationDefaults(intake).category_id;
  if (intakeCategoryId != null) return intakeCategoryId;

  const levelCategoryId = getLevelDefaultCategoryId(level);
  if (levelCategoryId != null) return levelCategoryId;

  if (categoryOverride) {
    const parsed = parseInt(categoryOverride, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return undefined;
}
