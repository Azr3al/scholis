"use client";
import { Button, Input, buttonVariants, inputClassName } from "@/components/primitives";

import type { DesignerGroup } from "@/lib/custom-fields/group-structure";
import type { CustomFieldDefinitionDto } from "@/types/custom-fields";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, DotsGrid3x3 as GripVertical, EditPencil as Pencil, Plus } from "iconoir-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FieldRow, type FieldDragHandleProps } from "./field-row";

export type DesignerStructureProps = {
  structure: DesignerGroup[];
  onEditField: (f: CustomFieldDefinitionDto) => void;
  onDeactivateField: (f: CustomFieldDefinitionDto) => void;
  onAddField: () => void;
  onReorderFields: (groupId: number, orderedFieldIds: number[]) => void;
  onReorderGroups: (orderedGroupIds: number[]) => void;
  onRenameGroup: (id: number, name: string) => void;
  onAddGroup: (name: string) => void;
};

type DragItemData =
  | { type: "group"; groupId: number }
  | { type: "field"; groupId: number; fieldId: number };

function groupSortableId(groupId: number): string {
  return `group-${groupId}`;
}

function fieldSortableId(fieldId: number): string {
  return `field-${fieldId}`;
}

function structureSignature(groups: DesignerGroup[]): string {
  return groups
    .map((g) => `${g.id}:${g.fields.map((f) => f.id).join(",")}`)
    .join("|");
}

function SortableFieldRow({
  field,
  groupId,
  onEditField,
  onDeactivateField,
}: {
  field: CustomFieldDefinitionDto;
  groupId: number;
  onEditField: (f: CustomFieldDefinitionDto) => void;
  onDeactivateField: (f: CustomFieldDefinitionDto) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: fieldSortableId(field.id),
    data: { type: "field", groupId, fieldId: field.id } satisfies DragItemData,
  });

  const dragHandle: FieldDragHandleProps = { attributes, listeners };

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
      <FieldRow
        field={field}
        dragHandle={dragHandle}
        isDragging={isDragging}
        onEdit={onEditField}
        onDeactivate={onDeactivateField}
      />
    </div>
  );
}

function GroupSection({
  group,
  dragHandle,
  isDragging = false,
  onEditField,
  onDeactivateField,
  onRenameGroup,
}: {
  group: DesignerGroup;
  dragHandle?: FieldDragHandleProps;
  isDragging?: boolean;
  onEditField: (f: CustomFieldDefinitionDto) => void;
  onDeactivateField: (f: CustomFieldDefinitionDto) => void;
  onRenameGroup: (id: number, name: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(group.name);

  const commitName = () => {
    setEditingName(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== group.name) onRenameGroup(group.id, trimmed);
    else setName(group.name);
  };

  const fieldIds = useMemo(
    () => group.fields.map((f) => fieldSortableId(f.id)),
    [group.fields]
  );

  return (
    <div className={isDragging ? "opacity-90" : undefined}>
      <div className="flex items-center gap-2 py-2">
        {!group.isUngrouped && dragHandle ? (
          <button
            type="button"
            aria-label="Drag group"
            {...dragHandle.attributes}
            {...dragHandle.listeners}
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            style={{ touchAction: "none" }}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {editingName ? (
          <div className="flex items-center gap-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-7 w-48"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && commitName()}
            />
            <Button type="button" size="sm" variant="ghost" onClick={commitName}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="group flex items-center gap-1 text-sm font-semibold"
            disabled={group.isUngrouped}
            onClick={() => {
              if (!group.isUngrouped) {
                setName(group.name);
                setEditingName(true);
              }
            }}
          >
            {group.name}
            {!group.isUngrouped ? (
              <Pencil className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />
            ) : null}
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          {group.fields.length} field{group.fields.length === 1 ? "" : "s"}
        </span>
      </div>

      {group.fields.length === 0 ? (
        <p className="border-t py-3 pl-6 text-xs text-muted-foreground">
          No fields here yet.
        </p>
      ) : (
        <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
          <div className="divide-y border-t pl-6">
            {group.fields.map((field) => (
              <SortableFieldRow
                key={field.id}
                field={field}
                groupId={group.id}
                onEditField={onEditField}
                onDeactivateField={onDeactivateField}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

function SortableGroup({
  group,
  onEditField,
  onDeactivateField,
  onRenameGroup,
}: {
  group: DesignerGroup;
  onEditField: (f: CustomFieldDefinitionDto) => void;
  onDeactivateField: (f: CustomFieldDefinitionDto) => void;
  onRenameGroup: (id: number, name: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: groupSortableId(group.id),
    data: { type: "group", groupId: group.id } satisfies DragItemData,
  });

  const dragHandle: FieldDragHandleProps = { attributes, listeners };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 50 : 0,
      }}
      className="bg-background px-4"
    >
      <GroupSection
        group={group}
        dragHandle={dragHandle}
        isDragging={isDragging}
        onEditField={onEditField}
        onDeactivateField={onDeactivateField}
        onRenameGroup={onRenameGroup}
      />
    </div>
  );
}

export function DesignerStructure({
  structure,
  onEditField,
  onDeactivateField,
  onAddField,
  onReorderFields,
  onReorderGroups,
  onRenameGroup,
  onAddGroup,
}: DesignerStructureProps) {
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [localStructure, setLocalStructure] = useState(structure);
  const isDraggingRef = useRef(false);

  const signature = useMemo(() => structureSignature(structure), [structure]);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setLocalStructure(structure);
  }, [signature, structure]);

  const sortableGroups = localStructure.filter((g) => !g.isUngrouped);
  const ungrouped = localStructure.find((g) => g.isUngrouped);
  const groupIds = useMemo(
    () => sortableGroups.map((g) => groupSortableId(g.id)),
    [sortableGroups]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Restrict collisions to droppables of the same kind: a group only collides
  // with other groups, a field only with fields in its own group. Without this,
  // a single closestCenter pass across all droppables resolves a group drag onto
  // a field row (the closest center), so group reorder never fires.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeData = args.active.data.current as DragItemData | undefined;
    if (!activeData) return closestCenter(args);

    const droppableContainers = args.droppableContainers.filter((container) => {
      const data = container.data.current as DragItemData | undefined;
      if (!data) return false;
      if (activeData.type === "group") return data.type === "group";
      if (activeData.type === "field") {
        return data.type === "field" && data.groupId === activeData.groupId;
      }
      return false;
    });

    return closestCenter({ ...args, droppableContainers });
  }, []);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      isDraggingRef.current = false;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeData = active.data.current as DragItemData | undefined;
      const overData = over.data.current as DragItemData | undefined;
      if (!activeData || !overData) return;

      if (activeData.type === "group" && overData.type === "group") {
        const oldIndex = sortableGroups.findIndex(
          (g) => g.id === activeData.groupId
        );
        const newIndex = sortableGroups.findIndex(
          (g) => g.id === overData.groupId
        );
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

        const reordered = arrayMove(sortableGroups, oldIndex, newIndex);
        setLocalStructure(
          ungrouped ? [...reordered, ungrouped] : reordered
        );
        onReorderGroups(reordered.map((g) => g.id));
        return;
      }

      if (activeData.type === "field" && overData.type === "field") {
        if (activeData.groupId !== overData.groupId) return;

        const group = localStructure.find((g) => g.id === activeData.groupId);
        if (!group) return;

        const oldIndex = group.fields.findIndex(
          (f) => f.id === activeData.fieldId
        );
        const newIndex = group.fields.findIndex(
          (f) => f.id === overData.fieldId
        );
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

        const reorderedFields = arrayMove(group.fields, oldIndex, newIndex);
        setLocalStructure((prev) =>
          prev.map((g) =>
            g.id === activeData.groupId
              ? { ...g, fields: reorderedFields }
              : g
          )
        );
        onReorderFields(
          activeData.groupId,
          reorderedFields.map((f) => f.id)
        );
      }
    },
    [localStructure, onReorderFields, onReorderGroups, sortableGroups, ungrouped]
  );

  const handleDragCancel = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const commitAddGroup = () => {
    const trimmed = groupName.trim();
    if (trimmed) onAddGroup(trimmed);
    setGroupName("");
    setAddingGroup(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="sm" onClick={onAddField}>
          <Plus className="mr-2 h-4 w-4" />
          Add field
        </Button>
        {addingGroup ? (
          <div className="flex items-center gap-1">
            <Input
              value={groupName}
              placeholder="Group name"
              className="h-8 w-40"
              autoFocus
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitAddGroup()}
            />
            <Button type="button" size="sm" onClick={commitAddGroup}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAddingGroup(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary" onClick={() => setAddingGroup(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add group
          </Button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="divide-y rounded-lg border">
          <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
            {sortableGroups.map((group) => (
              <SortableGroup
                key={group.id}
                group={group}
                onEditField={onEditField}
                onDeactivateField={onDeactivateField}
                onRenameGroup={onRenameGroup}
              />
            ))}
          </SortableContext>
          {ungrouped ? (
            <div className="px-4">
              <GroupSection
                group={ungrouped}
                onEditField={onEditField}
                onDeactivateField={onDeactivateField}
                onRenameGroup={onRenameGroup}
              />
            </div>
          ) : null}
        </div>
      </DndContext>
    </div>
  );
}
