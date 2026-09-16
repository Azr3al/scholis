export interface SelectionStats {
  count: number;
  sum: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export interface SelectionStatsInput {
  values: string[];
  numbers: (number | null)[];
}

export function computeSelectionStats({
  values,
  numbers,
}: SelectionStatsInput): SelectionStats {
  const count = values.filter((v) => v.trim() !== "").length;
  const nums = numbers.filter((n): n is number => n !== null);

  if (nums.length === 0) {
    return { count, sum: null, avg: null, min: null, max: null };
  }

  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    count,
    sum,
    avg: sum / nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}
