"use client";

import { Button, Menu, Select } from "@/components/primitives";
import { CANVAS_FONT_ALLOWLIST } from "@/lib/image-template/canvas-fonts";
import {
  bringForward,
  bringToFront,
  layerStackIndex,
  sendBackward,
  sendToBack,
} from "@/lib/image-template/layer-stack";
import { isTextLike, textStyleFlags } from "@/lib/image-template/layer-style";
import { applyFontSize } from "@/lib/image-template/scale-text-on-resize";
import type { Layer, TextAlign } from "@/lib/image-template/types";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  FastArrowDown,
  FastArrowUp,
  Minus,
  MultiplePages,
  NavArrowDown,
  NavArrowUp,
  Plus,
} from "iconoir-react";
import { useCallback, useEffect, useRef, type PointerEvent, type ReactNode } from "react";

const HOLD_DELAY_MS = 400;
const HOLD_INTERVAL_MS = 60;

function useHoldRepeat(action: () => void) {
  const actionRef = useRef(action);
  actionRef.current = action;
  const timers = useRef<{ delay?: number; interval?: number }>({});
  const stop = useCallback(() => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.interval);
    timers.current = {};
  }, []);
  useEffect(() => {
    window.addEventListener("pointerup", stop);
    return () => {
      stop();
      window.removeEventListener("pointerup", stop);
    };
  }, [stop]);
  const onPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    actionRef.current();
    timers.current.delay = window.setTimeout(() => {
      timers.current.interval = window.setInterval(() => actionRef.current(), HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }, []);
  return { onPointerDown, onPointerUp: stop, onPointerCancel: stop };
}

export type EffectsToolbarProps = {
  layer: Layer | null;
  layers?: Layer[];
  unitScale?: number;
  onChange: (layer: Layer) => void;
  onChangeLayers?: (layers: Layer[]) => void;
};

function LayerOrderMenu({
  layer,
  layers,
  onChangeLayers,
}: {
  layer: Layer;
  layers: Layer[];
  onChangeLayers: (layers: Layer[]) => void;
}) {
  const index = layerStackIndex(layers, layer.id);
  const last = layers.length - 1;
  const atBack = index <= 0;
  const atFront = index < 0 || index >= last;
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button type="button" variant="ghost" size="sm" aria-label="Layer">
            <MultiplePages width={16} height={16} aria-hidden />
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="start">
          <Menu.Popup>
            <Menu.Item
              className="justify-start"
              disabled={atFront}
              onClick={() => onChangeLayers(bringToFront(layers, layer.id))}
            >
              <FastArrowUp width={16} height={16} aria-hidden />
              Bring to front
            </Menu.Item>
            <Menu.Item
              className="justify-start"
              disabled={atFront}
              onClick={() => onChangeLayers(bringForward(layers, layer.id))}
            >
              <NavArrowUp width={16} height={16} aria-hidden />
              Bring forward
            </Menu.Item>
            <Menu.Item
              className="justify-start"
              disabled={atBack}
              onClick={() => onChangeLayers(sendBackward(layers, layer.id))}
            >
              <NavArrowDown width={16} height={16} aria-hidden />
              Send backward
            </Menu.Item>
            <Menu.Item
              className="justify-start"
              disabled={atBack}
              onClick={() => onChangeLayers(sendToBack(layers, layer.id))}
            >
              <FastArrowDown width={16} height={16} aria-hidden />
              Send to back
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const ALIGN: { value: TextAlign; label: string; icon: ReactNode }[] = [
  { value: "left", label: "Left", icon: <AlignLeft width={16} height={16} /> },
  { value: "center", label: "Center", icon: <AlignCenter width={16} height={16} /> },
  { value: "right", label: "Right", icon: <AlignRight width={16} height={16} /> },
];

export function EffectsToolbar({
  layer,
  layers,
  unitScale = 1,
  onChange,
  onChangeLayers,
}: EffectsToolbarProps) {
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const bumpFont = useCallback(
    (delta: number) => {
      const current = layerRef.current;
      if (!current || !isTextLike(current)) return;
      const size = Math.round(current.fontSize ?? 16);
      onChange(applyFontSize(current, size + delta, unitScale));
    },
    [onChange, unitScale],
  );
  const decreaseHold = useHoldRepeat(() => bumpFont(-1));
  const increaseHold = useHoldRepeat(() => bumpFont(1));

  if (!layer) return null;
  const stack = layers ?? [layer];
  const orderMenu = onChangeLayers ? (
    <LayerOrderMenu layer={layer} layers={stack} onChangeLayers={onChangeLayers} />
  ) : null;
  if (layer.type === "photo") {
    return (
      <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-2 py-1 text-sm text-text-primary">
        <label className="flex items-center gap-1 text-xs text-text-muted">
          Corner radius
          <input
            aria-label="Corner radius"
            type="number"
            min={0}
            className="h-7 w-16 rounded border border-border bg-surface-sunken px-1 text-text-primary"
            value={layer.borderRadiusPt ?? 0}
            onChange={(event) =>
              onChange({
                ...layer,
                borderRadiusPt: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant={layer.removeBackground ? "secondary" : "ghost"}
          aria-pressed={Boolean(layer.removeBackground)}
          onClick={() => onChange({ ...layer, removeBackground: !layer.removeBackground })}
        >
          Remove background
        </Button>
        {orderMenu}
      </div>
    );
  }
  if (!isTextLike(layer)) {
    return orderMenu ? (
      <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-2 py-1 text-sm text-text-primary">
        {orderMenu}
      </div>
    ) : null;
  }
  const flags = textStyleFlags(layer);
  const fontSize = Math.round(layer.fontSize ?? 16);
  const align = layer.align ?? "left";
  const alignItem = ALIGN.find((item) => item.value === align) ?? ALIGN[0];
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-elevated px-2 py-1 text-sm text-text-primary">
      <div className="w-48">
        <Select
          size="compact"
          aria-label="Font family"
          value={layer.fontFamily ?? "Noto Sans"}
          items={CANVAS_FONT_ALLOWLIST.map((font) => ({
            value: font.family,
            label: (
              <span style={{ fontFamily: `"${font.family}", sans-serif` }}>{font.label}</span>
            ),
          }))}
          onValueChange={(value) => onChange({ ...layer, fontFamily: value })}
        />
      </div>
      <div className="flex items-center rounded-md border border-border bg-surface-sunken">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Decrease font size"
          onClick={(event) => {
            if (event.detail === 0) bumpFont(-1);
          }}
          {...decreaseHold}
        >
          <Minus width={14} height={14} />
        </Button>
        <input
          aria-label="Font size"
          type="number"
          min={8}
          className="h-7 w-12 border-0 bg-transparent text-center text-text-primary outline-none"
          value={fontSize}
          onChange={(event) =>
            onChange(
              applyFontSize(layer, Math.max(8, Number(event.target.value) || 8), unitScale),
            )
          }
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Increase font size"
          onClick={(event) => {
            if (event.detail === 0) bumpFont(1);
          }}
          {...increaseHold}
        >
          <Plus width={14} height={14} />
        </Button>
      </div>
      <input
        aria-label="Color"
        type="color"
        className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0"
        value={layer.color && layer.color.startsWith("#") ? layer.color : "#111111"}
        onChange={(event) => onChange({ ...layer, color: event.target.value })}
      />
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          size="sm"
          variant={flags.bold ? "secondary" : "ghost"}
          aria-pressed={flags.bold}
          onClick={() => onChange({ ...layer, bold: !flags.bold })}
        >
          B
        </Button>
        <Button
          type="button"
          size="sm"
          variant={flags.italic ? "secondary" : "ghost"}
          aria-pressed={flags.italic}
          onClick={() => onChange({ ...layer, italic: !flags.italic })}
        >
          I
        </Button>
        <Button
          type="button"
          size="sm"
          variant={flags.underline ? "secondary" : "ghost"}
          aria-pressed={flags.underline}
          onClick={() => onChange({ ...layer, underline: !flags.underline })}
        >
          U
        </Button>
      </div>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button type="button" variant="ghost" size="sm" aria-label="Alignment">
              {alignItem.icon}
            </Button>
          }
        />
        <Menu.Portal>
          <Menu.Positioner align="start">
            <Menu.Popup>
              {ALIGN.map((item) => (
                <Menu.Item
                  key={item.value}
                  className="justify-start"
                  onClick={() => onChange({ ...layer, align: item.value })}
                >
                  {item.icon}
                  {item.label}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {orderMenu}
    </div>
  );
}
