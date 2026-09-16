export type FieldMeasure = "narrow" | "default" | "wide" | "full";

const MEASURE_CLASS: Record<FieldMeasure, string> = {
  narrow: "w-full max-w-md",
  default: "w-full max-w-xl",
  wide: "w-full max-w-2xl",
  full: "w-full max-w-none",
};

export function fieldMeasureClassName(measure: FieldMeasure): string {
  return MEASURE_CLASS[measure];
}

export function resolveFieldMeasure(
  fieldMeasure: FieldMeasure | undefined,
  formMeasure: FieldMeasure,
): FieldMeasure {
  return fieldMeasure ?? formMeasure;
}
