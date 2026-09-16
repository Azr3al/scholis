"use client";

import { Button } from "@/components/primitives";
import type { Layer } from "@/lib/image-template/types";

export function LayersPanel({
  layers,
  selectedId,
  onSelect,
  onDelete,
  label,
}: {
  layers: Layer[];
  selectedId: string | "page" | null;
  onSelect: (id: string) => void;
  onDelete: () => void;
  label: (layer: Layer) => string;
}) {
  const canDelete = Boolean(selectedId && selectedId !== "page");
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-text-muted">Layers</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Delete layer"
          disabled={!canDelete}
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
      <ul className="space-y-1">
        {layers.map((layer) => (
          <li key={layer.id}>
            <button
              type="button"
              className={`w-full truncate rounded px-2 py-1 text-left text-xs ${
                layer.id === selectedId ? "bg-surface-hover" : "hover:bg-surface"
              }`}
              onClick={() => onSelect(layer.id)}
            >
              {label(layer)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
