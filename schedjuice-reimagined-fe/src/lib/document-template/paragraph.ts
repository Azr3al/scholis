import type { TextBlock } from "./types";

export const FONT_SIZE_OPTIONS = [10, 11, 12, 14, 16, 18, 22, 28, 36] as const;
export const TEXT_COLOR_SWATCHES = [
  "#111111",
  "#6b7280",
  "#2f6e58",
  "#b91c1c",
] as const;

export type ParagraphPresetId = "title" | "heading1" | "subheading" | "body";

const PRESETS: Record<
  ParagraphPresetId,
  { fontSize: number; bold: boolean; italic: boolean }
> = {
  title: { fontSize: 28, bold: true, italic: false },
  heading1: { fontSize: 22, bold: true, italic: false },
  subheading: { fontSize: 16, bold: false, italic: false },
  body: { fontSize: 12, bold: false, italic: false },
};

export function matchParagraphPreset(block: TextBlock): ParagraphPresetId {
  const size = block.fontSize ?? 12;
  const bold = Boolean(block.bold);
  const ids: ParagraphPresetId[] = ["title", "heading1", "subheading", "body"];
  for (const id of ids) {
    const preset = PRESETS[id];
    if (preset.fontSize === size && preset.bold === bold) return id;
  }
  return "body";
}

export function stampParagraphPreset(
  block: TextBlock,
  id: ParagraphPresetId,
): TextBlock {
  const preset = PRESETS[id];
  return {
    ...block,
    fontFamily: block.fontFamily ?? "Noto Sans",
    fontSize: preset.fontSize,
    bold: preset.bold,
    italic: preset.italic,
  };
}
