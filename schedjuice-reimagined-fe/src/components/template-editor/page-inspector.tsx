"use client";

import { Button, Input, Select } from "@/components/primitives";
import { pagePresetsForKind } from "@/lib/image-template/page-presets";
import type { PagePreset, TemplateKind } from "@/lib/image-template/types";
import { useState } from "react";

const PRESET_LABELS: Record<PagePreset, string> = {
  original: "Original image",
  hd_16_9: "16:9 HD",
  a4_landscape: "A4 landscape",
  id_cr80_portrait: "ID card · portrait",
  id_cr80_landscape: "ID card · landscape",
  custom: "Custom",
};

export type PageInspectorProps = {
  kind: TemplateKind;
  pagePreset: PagePreset;
  width: number;
  height: number;
  adjustBackground?: boolean;
  onPreset: (preset: PagePreset, custom?: { width: number; height: number }) => void;
  onReplaceFile: (file: File) => void;
  onToggleAdjust?: () => void;
};

export function PageInspector({
  kind,
  pagePreset,
  width,
  height,
  adjustBackground = false,
  onPreset,
  onReplaceFile,
  onToggleAdjust,
}: PageInspectorProps) {
  const presets = pagePresetsForKind(kind);
  const [customWidth, setCustomWidth] = useState(String(Math.round(width) || ""));
  const [customHeight, setCustomHeight] = useState(String(Math.round(height) || ""));

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">Page</p>
      <label className="block text-xs text-text-muted">
        Size
        <Select
          className="mt-1"
          size="compact"
          value={pagePreset}
          items={presets.map((preset) => ({
            value: preset,
            label: PRESET_LABELS[preset],
          }))}
          onValueChange={(value) => {
            const preset = value as PagePreset;
            if (preset === "custom") {
              onPreset("custom", {
                width: Number(customWidth) || width,
                height: Number(customHeight) || height,
              });
              return;
            }
            onPreset(preset);
          }}
        />
      </label>
      {kind !== "id_card" && pagePreset === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-text-muted">
            Width
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={8192}
              value={customWidth}
              onChange={(event) => setCustomWidth(event.target.value)}
              onBlur={() =>
                onPreset("custom", {
                  width: Number(customWidth),
                  height: Number(customHeight),
                })
              }
            />
          </label>
          <label className="block text-xs text-text-muted">
            Height
            <Input
              className="mt-1"
              type="number"
              min={1}
              max={8192}
              value={customHeight}
              onChange={(event) => setCustomHeight(event.target.value)}
              onBlur={() =>
                onPreset("custom", {
                  width: Number(customWidth),
                  height: Number(customHeight),
                })
              }
            />
          </label>
        </div>
      ) : null}
      <label className="block text-xs text-text-muted">
        Replace background
        <input
          type="file"
          accept="image/png,image/jpeg"
          className="mt-1 block w-full text-xs text-text-primary"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onReplaceFile(file);
          }}
        />
      </label>
      {onToggleAdjust ? (
        <Button
          type="button"
          variant={adjustBackground ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={adjustBackground}
          onClick={onToggleAdjust}
        >
          Adjust background
        </Button>
      ) : null}
    </div>
  );
}
