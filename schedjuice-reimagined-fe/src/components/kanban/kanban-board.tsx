"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { KanbanColumn, type KanbanColumnDef } from "./kanban-column";

/**
 * Domain-agnostic kanban board: DnD wiring (`@dnd-kit`), column layout, and
 * drag overlay shared by every board (Leads, Issues, ...). Domains supply
 * their own item shape, card visuals (`renderCard`), and move/open handlers.
 */
export function KanbanBoard<T>({
  columns,
  itemsByColumn,
  getItemId,
  renderCard,
  onOpenItem,
  onMoveItem,
}: {
  columns: KanbanColumnDef[];
  itemsByColumn: Map<number, T[]> | Record<number, T[]>;
  getItemId: (item: T) => number;
  renderCard: (item: T, opts: { overlay?: boolean }) => ReactNode;
  onOpenItem: (item: T) => void;
  onMoveItem: (item: T, column: { id: number }) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const [activeItem, setActiveItem] = useState<T | null>(null);

  const getColumnItems = useMemo(() => {
    const isMap = itemsByColumn instanceof Map;
    return (columnId: number): T[] =>
      (isMap ? itemsByColumn.get(columnId) : itemsByColumn[columnId]) ?? [];
  }, [itemsByColumn]);

  function handleDragStart(event: DragStartEvent) {
    setActiveItem((event.active.data.current?.item as T | undefined) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);
    const item = event.active.data.current?.item as T | undefined;
    const column = event.over?.data.current?.column as
      | KanbanColumnDef
      | undefined;
    if (!item || !column) return;
    onMoveItem(item, column);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveItem(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            items={getColumnItems(column.id)}
            getItemId={getItemId}
            renderCard={renderCard}
            onOpenItem={onOpenItem}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? renderCard(activeItem, { overlay: true }) : null}
      </DragOverlay>
    </DndContext>
  );
}
