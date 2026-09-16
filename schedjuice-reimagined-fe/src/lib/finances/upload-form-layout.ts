import type { PartFieldKey } from "./upload-part-validation";
import { fieldNameForPartField } from "./upload-part-validation";

export function uploadPartFieldDataName(
  partKey: string,
  field: PartFieldKey,
): string {
  return fieldNameForPartField(partKey, field);
}

export function uploadPartSectionClassName(): string {
  return "flex w-full min-w-0 flex-col gap-2";
}

export function uploadPartScreenshotStackClassName(): string {
  return "w-full space-y-2";
}

export function uploadPartFieldRootClassName(): string {
  return "w-full gap-1.5";
}

export function uploadFormActionsClassName(): string {
  return "sticky bottom-0 z-sticky flex w-full flex-wrap items-center gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm";
}
