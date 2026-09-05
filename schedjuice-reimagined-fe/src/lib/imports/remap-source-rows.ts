import type { ImportValidationError } from "@/lib/imports/validation-errors";

function removedBelow(index: number, removed: readonly number[]): number {
  let count = 0;
  for (const r of removed) {
    if (r < index) count += 1;
  }
  return count;
}

export function remapSourceRowIndex(
  index: number,
  removed: readonly number[],
): number | null {
  if (removed.includes(index)) return null;
  return index - removedBelow(index, removed);
}

export function remapSourceRowIndices(
  indices: readonly number[],
  removed: readonly number[],
): number[] {
  return indices
    .map((index) => remapSourceRowIndex(index, removed))
    .filter((index): index is number => index !== null);
}

export function remapValidationErrors(
  errors: readonly ImportValidationError[],
  removed: readonly number[],
): ImportValidationError[] {
  const out: ImportValidationError[] = [];
  for (const error of errors) {
    const nextIndex = remapSourceRowIndex(error.sourceRow, removed);
    if (nextIndex === null) continue;
    out.push({ ...error, sourceRow: nextIndex });
  }
  return out;
}
