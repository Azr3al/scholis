import type { organizationType } from "@/types/organization";
import {
  IdCardTemplateAudience,
  toIdCardTemplateSummary,
  type IdCardTemplateSummary,
} from "@/types/id-card-template";

export function getActiveIdCardTemplate(
  tenant: organizationType | null | undefined,
  audience: IdCardTemplateAudience,
): IdCardTemplateSummary | null {
  if (!tenant) return null;
  if (audience === IdCardTemplateAudience.student) {
    return toIdCardTemplateSummary(tenant.active_student_id_card_template);
  }
  return toIdCardTemplateSummary(tenant.active_staff_id_card_template);
}

export function getActiveIdCardTemplateForRole(
  tenant: organizationType | null | undefined,
  role: "student" | "staff",
): IdCardTemplateSummary | null {
  return getActiveIdCardTemplate(
    tenant,
    role === "student"
      ? IdCardTemplateAudience.student
      : IdCardTemplateAudience.staff,
  );
}
