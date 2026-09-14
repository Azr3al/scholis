// src/lib/sj/script.ts

/** MYANMAR_RANGE mirrors the `unicode-range` split in globals.css (DESIGN.md §6). */
const MYANMAR_RANGE = /[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F]/;

/**
 * True when a string will route to Noto Sans Myanmar for any of its glyphs.
 *
 * Myanmar stacks diacritics above and below the baseline, so display leading
 * tuned for Latin ascenders clips it. Callers use this to relax leading rather
 * than to pick a font — `unicode-range` already handles font selection.
 */
export function containsMyanmar(value: string | null | undefined): boolean {
  if (!value) return false;
  return MYANMAR_RANGE.test(value);
}
