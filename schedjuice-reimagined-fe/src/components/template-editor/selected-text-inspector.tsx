"use client";

import { TemplateCopyEditor } from "@/components/template-editor/template-copy-editor";
import { applyInlineText } from "@/lib/image-template/scale-text-on-resize";
import type { Layer } from "@/lib/image-template/types";
import { layerCopy } from "@/lib/image-template/variable-template";

export function SelectedTextInspector({
  layer,
  onChange,
}: {
  layer: Layer;
  onChange: (layer: Layer) => void;
}) {
  if (layer.type !== "text" && layer.type !== "field" && layer.type !== "named_person") {
    return null;
  }
  return (
    <label className="block text-xs text-text-muted">
      {layer.type === "text" ? "Text" : "Template"}
      <div className="mt-1">
        <TemplateCopyEditor
          value={layerCopy(layer)}
          onChange={(next) => onChange(applyInlineText(layer, next))}
        />
      </div>
    </label>
  );
}
