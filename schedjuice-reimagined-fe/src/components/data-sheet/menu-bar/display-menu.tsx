"use client";
import { Button, Menu } from "@/components/primitives";

import { TableRows as Rows3, Type } from "iconoir-react";
import { cn } from "@/lib/utils";

import type { SheetDensity, SheetFontSize } from "../types";
import {
  FONT_SIZE_LABELS,
  FONT_SIZE_ORDER,
  FONT_SIZE_PX,
} from "../types";

const DENSITY_OPTIONS: { value: SheetDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

const FONT_SIZE_OPTIONS = FONT_SIZE_ORDER.map((value) => ({
  value,
  label: `${FONT_SIZE_LABELS[value]} (${FONT_SIZE_PX[value]}px)`,
}));

export function DensityMenu({
  value,
  onChange,
  compact = false,
}: {
  value: SheetDensity;
  onChange: (value: SheetDensity) => void;
  compact?: boolean;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 gap-1 text-[11px] text-foreground/70",
              compact ? "px-1.5" : "px-2",
            )}
            title="Density"
            aria-label="Density"
          >
            <Rows3 className="size-3.5" aria-hidden />
            {!compact ? "Density" : null}
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="start">
          <Menu.Popup className="min-w-40">
            {DENSITY_OPTIONS.map((opt) => (
              <Menu.Item
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={value === opt.value ? "font-medium" : undefined}
              >
                {opt.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function FontSizeMenu({
  value,
  onChange,
  compact = false,
}: {
  value: SheetFontSize;
  onChange: (value: SheetFontSize) => void;
  compact?: boolean;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 gap-1 text-[11px] text-foreground/70",
              compact ? "px-1.5" : "px-2",
            )}
            title="Font"
            aria-label="Font"
          >
            <Type className="size-3.5" aria-hidden />
            {!compact ? "Font" : null}
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="start">
          <Menu.Popup className="min-w-36">
            {FONT_SIZE_OPTIONS.map((opt) => (
              <Menu.Item
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={value === opt.value ? "font-medium" : undefined}
              >
                {opt.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
