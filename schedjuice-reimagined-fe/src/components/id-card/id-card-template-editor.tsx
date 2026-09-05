"use client";

import { Button, Input, Select, Textarea, inputClassName } from "@/components/primitives";
import {
  isEditableTextSlot,
  slotDisplayText,
  slotPreviewLabel,
} from "@/lib/id-card/template-field-values";
import {
  ID_CARD_TEXT_FONT_FAMILY,
  resolveSlotFontFamily,
} from "@/lib/id-card/template-fonts";
import {
  editorDisplayScale,
  inchesToPx,
  pointsToPx,
  pxToInches,
  roundInches,
} from "@/lib/id-card/template-geometry";
import { cn } from "@/lib/utils";
import {
  clampIdCardFontSizePt,
  DEFAULT_ID_CARD_FONT_SIZE_PT,
  ID_CARD_FONT_SIZE_PT_OPTIONS,
  ID_CARD_SLOT_PALETTE,
  IdCardSlotType,
  IdCardTextSlotField,
  ID_CARD_TEMPLATE_DPI,
  type IdCardEditableTextSlot,
  type IdCardTemplateSlot,
} from "@/types/id-card-template";
import { useCallback, useMemo, useRef, useState } from "react";

type DragMode = "move" | "resize";

type IdCardTemplateEditorProps = {
  widthIn: number;
  heightIn: number;
  backgroundUrl: string | null;
  slots: IdCardTemplateSlot[];
  onChange: (slots: IdCardTemplateSlot[]) => void;
};

function createSlot(
  type: IdCardSlotType,
  field?: IdCardTextSlotField,
): IdCardTemplateSlot {
  const base = {
    id: `${type}-${field ?? "slot"}-${Date.now()}`,
    x: 0.2,
    y: 0.5,
    width: 1.7,
    height: 0.25,
  };
  if (type === IdCardSlotType.photo) {
    return {
      ...base,
      type,
      width: 0.9,
      height: 1.1,
      x: 0.55,
      y: 0.85,
      borderRadiusPt: 0,
    };
  }
  if (type === IdCardSlotType.qr) {
    return { ...base, type, width: 0.7, height: 0.7, x: 1.2, y: 2.55 };
  }
  if (type === IdCardSlotType.staticText) {
    return {
      ...base,
      type,
      text: "Your text",
      fontSizePt: DEFAULT_ID_CARD_FONT_SIZE_PT,
      fontFamily: ID_CARD_TEXT_FONT_FAMILY,
      color: "#111111",
      align: "center",
    };
  }
  return {
    ...base,
    type,
    field: field ?? IdCardTextSlotField.name,
    fontSizePt: DEFAULT_ID_CARD_FONT_SIZE_PT,
    fontFamily: ID_CARD_TEXT_FONT_FAMILY,
    color: "#111111",
    align: "center",
  };
}

export function IdCardTemplateEditor({
  widthIn,
  heightIn,
  backgroundUrl,
  slots,
  onChange,
}: IdCardTemplateEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<{
    slotId: string;
    mode: DragMode;
    startX: number;
    startY: number;
    origin: IdCardTemplateSlot;
  } | null>(null);

  const displayScale = useMemo(
    () => editorDisplayScale(widthIn, heightIn),
    [widthIn, heightIn],
  );
  const canvasPx = useMemo(
    () => ({
      width: inchesToPx(widthIn) * displayScale,
      height: inchesToPx(heightIn) * displayScale,
    }),
    [widthIn, heightIn, displayScale],
  );

  const selectedSlot = slots.find((slot) => slot.id === selectedId) ?? null;
  const selectedEditableTextSlot =
    selectedSlot && isEditableTextSlot(selectedSlot) ? selectedSlot : null;
  const selectedStaticTextSlot =
    selectedSlot?.type === IdCardSlotType.staticText ? selectedSlot : null;

  const fontSizeSelectItems = useMemo(() => {
    const current =
      selectedEditableTextSlot?.fontSizePt ?? DEFAULT_ID_CARD_FONT_SIZE_PT;
    const sizes = new Set<number>([...ID_CARD_FONT_SIZE_PT_OPTIONS, current]);
    return Array.from(sizes)
      .sort((a, b) => a - b)
      .map((size) => ({ value: String(size), label: `${size} pt` }));
  }, [selectedEditableTextSlot?.fontSizePt]);

  const updateSlot = useCallback(
    (slotId: string, patch: Partial<IdCardTemplateSlot>) => {
      onChange(
        slots.map((slot) =>
          slot.id === slotId ? ({ ...slot, ...patch } as IdCardTemplateSlot) : slot,
        ),
      );
    },
    [onChange, slots],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dxDisplay = event.clientX - drag.startX;
      const dyDisplay = event.clientY - drag.startY;
      const dxIn = pxToInches(dxDisplay / displayScale, ID_CARD_TEMPLATE_DPI);
      const dyIn = pxToInches(dyDisplay / displayScale, ID_CARD_TEMPLATE_DPI);

      if (drag.mode === "move") {
        updateSlot(drag.slotId, {
          x: roundInches(Math.max(0, drag.origin.x + dxIn)),
          y: roundInches(Math.max(0, drag.origin.y + dyIn)),
        });
      } else if (drag.origin.type === IdCardSlotType.qr) {
        const nextW = drag.origin.width + dxIn;
        const nextH = drag.origin.height + dyIn;
        const size = roundInches(Math.max(0.1, Math.max(nextW, nextH)));
        updateSlot(drag.slotId, { width: size, height: size });
      } else {
        updateSlot(drag.slotId, {
          width: roundInches(Math.max(0.1, drag.origin.width + dxIn)),
          height: roundInches(Math.max(0.1, drag.origin.height + dyIn)),
        });
      }
    },
    [displayScale, updateSlot],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerMove]);

  const startDrag = (
    event: React.PointerEvent,
    slot: IdCardTemplateSlot,
    mode: DragMode,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(slot.id);
    dragRef.current = {
      slotId: slot.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...slot },
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  function addSlot(type: IdCardSlotType, field?: IdCardTextSlotField) {
    const slot = createSlot(type, field);
    onChange([...slots, slot]);
    setSelectedId(slot.id);
  }

  function removeSelected() {
    if (!selectedId) return;
    onChange(slots.filter((slot) => slot.id !== selectedId));
    setSelectedId(null);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,12rem)_1fr]">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Add field</p>
        <div className="flex flex-col gap-2">
          {ID_CARD_SLOT_PALETTE.map((item) => (
            <Button
              key={`${item.type}-${item.field ?? "none"}`}
              type="button"
              variant="secondary"
              size="sm"
              className="justify-start"
              onClick={() => addSlot(item.type, item.field)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {selectedSlot ? (
          <Button
            type="button"
            variant="danger"
            size="sm"
            className="mt-4 w-full"
            onClick={removeSelected}
          >
            Remove selected
          </Button>
        ) : null}

        {selectedEditableTextSlot ? (
          <div className="mt-4 space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Text settings</p>
            {selectedStaticTextSlot ? (
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Text</span>
                <Textarea
                  value={selectedStaticTextSlot.text}
                  onChange={(event) =>
                    updateSlot(selectedStaticTextSlot.id, {
                      text: event.target.value,
                    })
                  }
                  rows={3}
                  className={inputClassName}
                  placeholder="Enter fixed label or copy"
                />
              </label>
            ) : null}
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Font size (pt)</span>
              <div className="flex gap-2">
                <Select
                  value={String(
                    selectedEditableTextSlot.fontSizePt ?? DEFAULT_ID_CARD_FONT_SIZE_PT,
                  )}
                  onValueChange={(value) =>
                    updateSlot(selectedEditableTextSlot.id, {
                      fontSizePt: clampIdCardFontSizePt(Number(value)),
                    })
                  }
                  className="min-w-0 flex-1"
                  items={fontSizeSelectItems}
                />
                <Input
                  type="number"
                  min={6}
                  max={72}
                  step={1}
                  className={cn(inputClassName, "w-20 shrink-0")}
                  value={
                    selectedEditableTextSlot.fontSizePt ?? DEFAULT_ID_CARD_FONT_SIZE_PT
                  }
                  onChange={(event) =>
                    updateSlot(selectedEditableTextSlot.id, {
                      fontSizePt: clampIdCardFontSizePt(
                        Number(event.target.value) || DEFAULT_ID_CARD_FONT_SIZE_PT,
                      ),
                    })
                  }
                />
              </div>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Color</span>
              <Input
                type="color"
                className={inputClassName}
                value={selectedEditableTextSlot.color ?? "#111111"}
                onChange={(event) =>
                  updateSlot(selectedEditableTextSlot.id, { color: event.target.value })
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Align</span>
              <select
                className={inputClassName}
                value={selectedEditableTextSlot.align ?? "center"}
                onChange={(event) =>
                  updateSlot(selectedEditableTextSlot.id, {
                    align: event.target.value as IdCardEditableTextSlot["align"],
                  })
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-lg border border-border bg-muted/30"
          style={{ width: canvasPx.width, height: canvasPx.height }}
        >
          {backgroundUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backgroundUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-fill"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 bg-white" />
          )}

          {slots.map((slot) => {
            const left = inchesToPx(slot.x) * displayScale;
            const top = inchesToPx(slot.y) * displayScale;
            const width = inchesToPx(slot.width) * displayScale;
            const height = inchesToPx(slot.height) * displayScale;
            const isSelected = slot.id === selectedId;
            const photoRadiusPx =
              slot.type === IdCardSlotType.photo
                ? pointsToPx(slot.borderRadiusPt ?? 0) * displayScale
                : 0;
            const editableTextSlot = isEditableTextSlot(slot) ? slot : null;
            const textFontSizePx = editableTextSlot
              ? pointsToPx(
                  editableTextSlot.fontSizePt ?? DEFAULT_ID_CARD_FONT_SIZE_PT,
                ) * displayScale
              : 0;
            return (
              <div
                key={slot.id}
                className={cn(
                  "absolute border-2",
                  editableTextSlot ? "bg-transparent" : "bg-primary/10",
                  isSelected ? "border-primary" : "border-primary/50",
                )}
                style={{
                  left,
                  top,
                  width,
                  height,
                  borderRadius: photoRadiusPx > 0 ? photoRadiusPx : undefined,
                }}
                onPointerDown={(event) => startDrag(event, slot, "move")}
              >
                {editableTextSlot ? (
                  <div
                    className="pointer-events-none absolute inset-0 flex overflow-hidden px-0.5 leading-none"
                    style={{
                      fontFamily: resolveSlotFontFamily(editableTextSlot.fontFamily),
                      fontSize: textFontSizePx,
                      color: editableTextSlot.color ?? "#111111",
                      textAlign: editableTextSlot.align ?? "center",
                      justifyContent:
                        editableTextSlot.align === "left"
                          ? "flex-start"
                          : editableTextSlot.align === "right"
                            ? "flex-end"
                            : "center",
                      alignItems: "center",
                    }}
                  >
                    <span className="w-full truncate whitespace-pre-wrap">
                      {slotDisplayText(editableTextSlot)}
                    </span>
                  </div>
                ) : null}
                <span className="pointer-events-none absolute left-1 top-1 rounded bg-background/90 px-1 text-[10px] font-medium">
                  {slotPreviewLabel(slot)}
                  {editableTextSlot
                    ? ` · ${editableTextSlot.fontSizePt ?? DEFAULT_ID_CARD_FONT_SIZE_PT}pt`
                    : null}
                </span>
                <div
                  className="absolute bottom-0 right-0 size-3 cursor-se-resize bg-primary"
                  onPointerDown={(event) => startDrag(event, slot, "resize")}
                />
              </div>
            );
          })}
        </div>

        {selectedSlot && selectedSlot.type === IdCardSlotType.photo ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Corner radius (pt)</span>
              <Input
                type="number"
                min={0}
                max={72}
                step={1}
                className={inputClassName}
                value={selectedSlot.borderRadiusPt ?? 0}
                onChange={(event) =>
                  updateSlot(selectedSlot.id, {
                    borderRadiusPt: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
