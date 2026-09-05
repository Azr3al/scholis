export interface MeasureOptions {
  charWidth: number;
  padding: number;
  min: number;
  max: number;
}

export function estimateColumnWidth(
  values: readonly string[],
  header: string,
  { charWidth, padding, min, max }: MeasureOptions,
): number {
  const longest = [header, ...values].reduce(
    (acc, v) => Math.max(acc, v.length),
    0,
  );
  const raw = longest * charWidth + padding;
  return Math.min(max, Math.max(min, raw));
}
