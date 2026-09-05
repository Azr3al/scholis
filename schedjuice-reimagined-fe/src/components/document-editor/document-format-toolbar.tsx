"use client";

import { Button, Select } from "@/components/primitives";
import { CANVAS_FONT_ALLOWLIST } from "@/lib/image-template/canvas-fonts";
import {
  FONT_SIZE_OPTIONS,
  TEXT_COLOR_SWATCHES,
  matchParagraphPreset,
  stampParagraphPreset,
  type ParagraphPresetId,
} from "@/lib/document-template/paragraph";
import type { TextAlign, TextBlock } from "@/lib/document-template/types";
import { AlignCenter, AlignLeft, AlignRight } from "iconoir-react";
import { cn } from "@/lib/utils";

const PARAGRAPH_ITEMS: { value: ParagraphPresetId; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "heading1", label: "Heading 1" },
  { value: "subheading", label: "Subheading" },
  { value: "body", label: "Body" },
];

const ALIGN: { value: TextAlign; label: string; icon: typeof AlignLeft }[] = [
  { value: "left", label: "Align left", icon: AlignLeft },
  { value: "center", label: "Align center", icon: AlignCenter },
  { value: "right", label: "Align right", icon: AlignRight },
];

export function DocumentFormatToolbar({
  block,
  onChange,
}: {
  block: TextBlock | null;
  onChange: (next: TextBlock) => void;
}) {
  const disabled = block == null;
  const paragraph = block ? matchParagraphPreset(block) : "body";
  const fontFamily = block?.fontFamily ?? "Noto Sans";
  const fontSize = String(block?.fontSize ?? 12);
  const color = block?.color ?? "#111111";
  const align = block?.align ?? "left";
  const bold = Boolean(block?.bold);
  const italic = Boolean(block?.italic);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
      <div className="w-36">
        <Select
          size="compact"
          disabled={disabled}
          aria-label="Paragraph"
          value={paragraph}
          items={PARAGRAPH_ITEMS}
          onValueChange={(value) => {
            if (!block) return;
            onChange(stampParagraphPreset(block, value as ParagraphPresetId));
          }}
        />
      </div>
      <div className="w-48">
        <Select
          size="compact"
          disabled={disabled}
          aria-label="Font family"
          value={fontFamily}
          items={CANVAS_FONT_ALLOWLIST.map((font) => ({
            value: font.family,
            label: font.label,
          }))}
          onValueChange={(value) => {
            if (!block) return;
            onChange({ ...block, fontFamily: value });
          }}
        />
      </div>
      <div className="w-20">
        <Select
          size="compact"
          disabled={disabled}
          aria-label="Font size"
          value={fontSize}
          items={FONT_SIZE_OPTIONS.map((size) => ({
            value: String(size),
            label: String(size),
          }))}
          onValueChange={(value) => {
            if (!block) return;
            onChange({ ...block, fontSize: Number(value) });
          }}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant={bold ? "secondary" : "ghost"}
        aria-label="Bold"
        aria-pressed={bold}
        disabled={disabled}
        onClick={() => {
          if (!block) return;
          onChange({ ...block, bold: !bold });
        }}
      >
        B
      </Button>
      <Button
        type="button"
        size="sm"
        variant={italic ? "secondary" : "ghost"}
        aria-label="Italic"
        aria-pressed={italic}
        disabled={disabled}
        onClick={() => {
          if (!block) return;
          onChange({ ...block, italic: !italic });
        }}
      >
        I
      </Button>
      <div className="flex items-center gap-1">
        {TEXT_COLOR_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`Text color ${hex}`}
            aria-pressed={color.toLowerCase() === hex}
            disabled={disabled}
            className={cn(
              "size-5 rounded-sm border border-border",
              color.toLowerCase() === hex ? "ring-2 ring-blue-400 ring-offset-1" : "",
            )}
            style={{ backgroundColor: hex }}
            onClick={() => {
              if (!block) return;
              onChange({ ...block, color: hex });
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-0.5">
        {ALIGN.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={align === item.value ? "secondary" : "ghost"}
              aria-label={item.label}
              aria-pressed={align === item.value}
              disabled={disabled}
              className="size-8 px-0"
              onClick={() => {
                if (!block) return;
                onChange({ ...block, align: item.value });
              }}
            >
              <Icon width={16} height={16} aria-hidden />
            </Button>
          );
        })}
      </div>
    </div>
  );
}
