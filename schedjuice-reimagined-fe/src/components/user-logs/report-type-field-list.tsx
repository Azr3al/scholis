"use client";
import { Button } from "@/components/primitives";

import { reindexDraftFields } from "@/lib/user-logs/report-type-field-reorder";
import type { DraftReportTypeField } from "@/lib/user-logs/report-type-field-validation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "iconoir-react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { ReportTypeFieldEditorSheet } from "./report-type-field-editor-sheet";
import {
  ReportTypeFieldRow,
  type ReportFieldDragHandle,
} from "./report-type-field-row";

function sortableId(fieldKey: string): string {
  return `report-field-${fieldKey}`;
}

function SortableReportFieldRow({
  field,
  onEdit,
  onRemove,
}: {
  field: DraftReportTypeField;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId(field.field_key) });

  const dragHandle: ReportFieldDragHandle = { attributes, listeners };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 50 : 0,
      }}
    >
      <ReportTypeFieldRow
        field={field}
        dragHandle={dragHandle}
        isDragging={isDragging}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    </div>
  );
}

export type ReportTypeFieldListHandle = {
  openFieldAtIndex: (index: number) => void;
};

export const ReportTypeFieldList = forwardRef<
  ReportTypeFieldListHandle,
  {
    value: DraftReportTypeField[];
    onChange: (fields: DraftReportTypeField[]) => void;
  }
>(function ReportTypeFieldList({ value, onChange }, ref) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const openCreate = () => {
    setEditingIndex(null);
    setSheetOpen(true);
  };

  const openEdit = (index: number) => {
    setEditingIndex(index);
    setSheetOpen(true);
  };

  useImperativeHandle(ref, () => ({
    openFieldAtIndex: (index: number) => openEdit(index),
  }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = value.findIndex(
      (f) => sortableId(f.field_key) === active.id,
    );
    const newIndex = value.findIndex(
      (f) => sortableId(f.field_key) === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(reindexDraftFields(arrayMove(value, oldIndex, newIndex)));
  };

  const handleSave = (field: DraftReportTypeField) => {
    if (editingIndex == null) {
      onChange(reindexDraftFields([...value, field]));
      return;
    }
    const next = [...value];
    next[editingIndex] = field;
    onChange(reindexDraftFields(next));
  };

  const handleRemove = (index: number) => {
    onChange(reindexDraftFields(value.filter((_, i) => i !== index)));
  };

  const editing = editingIndex == null ? null : (value[editingIndex] ?? null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label>Custom fields</label>
        <Button type="button" variant="secondary" size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add field
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No custom fields yet. Add one to collect structured data with each log
          entry.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={value.map((f) => sortableId(f.field_key))}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {value.map((f, i) => (
                <SortableReportFieldRow
                  key={f.field_key}
                  field={f}
                  onEdit={() => openEdit(i)}
                  onRemove={() => handleRemove(i)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ReportTypeFieldEditorSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editing={editing}
        sortOrder={value.length}
        onSave={handleSave}
      />
    </div>
  );
});
