import type { PagePreset, TemplateKind } from "./types";

export function pagePresetsForKind(kind: TemplateKind): PagePreset[] {
  if (kind === "id_card") return ["id_cr80_portrait", "id_cr80_landscape"];
  return ["original", "hd_16_9", "a4_landscape", "custom"];
}

export function sizeForPreset(
  preset: Exclude<PagePreset, "original" | "custom">,
): { width: number; height: number; unit: "px" | "in" } {
  if (preset === "hd_16_9") return { width: 1920, height: 1080, unit: "px" };
  if (preset === "a4_landscape") return { width: 3508, height: 2480, unit: "px" };
  if (preset === "id_cr80_portrait") return { width: 2.125, height: 3.375, unit: "in" };
  return { width: 3.375, height: 2.125, unit: "in" };
}
