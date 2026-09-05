import { slugifyTitle } from "./slugify";

export function headingToId(text: string): string {
  return slugifyTitle(text);
}

export function assignHeadingIds(texts: string[]): string[] {
  const seen = new Map<string, number>();
  return texts.map((text) => {
    const base = headingToId(text) || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  });
}
