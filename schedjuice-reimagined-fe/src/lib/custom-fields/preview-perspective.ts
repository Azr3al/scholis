import type { FormActor } from "@/lib/custom-fields/field-policy";
import type { FormSurface } from "@/types/form-config";

export type PreviewPerspective = "self" | "staff";

export function previewActor(perspective: PreviewPerspective): FormActor {
  return perspective === "staff" ? "admin" : "user";
}

export function defaultPerspectiveForSurface(
  surface: FormSurface,
): PreviewPerspective {
  return surface === "create" ? "staff" : "self";
}

/** Banner line under the role selector. */
export function previewBannerText(
  roleLabel: string,
  perspective: PreviewPerspective,
  surface: FormSurface,
): string {
  let text = `Previewing a ${roleLabel} profile`;
  if (surface === "detail") return text;
  text += perspective === "staff" ? " · staff editing" : " · self-edit";
  return text;
}
