import { coerceEntityId } from "@/helpers/entity-ids";

export type CourseWithFkIds = {
  category?: unknown;
  category_id?: unknown;
  payment_plan?: unknown;
  payment_plan_id?: unknown;
  [key: string]: unknown;
};

/**
 * Flattens API course (nested FKs + raw ids) into a single RHF value map.
 * Uses one shape so we can `reset()` without FK fields racing with many `setValue` calls.
 */
export function buildCourseFormValues(
  c: CourseWithFkIds,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(c)) {
    if (
      key === "category" ||
      key === "category_id" ||
      key === "payment_plan" ||
      key === "payment_plan_id"
    ) {
      continue;
    }
    const val = c[key];
    if (val && typeof val === "object" && "id" in val) {
      out[key] = (val as { id: number }).id;
    } else {
      out[key] = val;
    }
  }
  out.category =
    coerceEntityId(c.category) ?? coerceEntityId(c.category_id) ?? null;
  out.payment_plan =
    coerceEntityId(c.payment_plan) ??
    coerceEntityId(c.payment_plan_id) ??
    null;
  return out;
}
