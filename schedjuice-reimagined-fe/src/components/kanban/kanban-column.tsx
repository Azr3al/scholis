"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { KanbanCardShell } from "./kanban-card-shell";

export interface KanbanColumnDef {
  id: number;
  name: string;
  color: string;
}

export function KanbanColumn<T>({
  column,
  items,
  getItemId,
  renderCard,
  onOpenItem,
}: {
  column: KanbanColumnDef;
  items: T[];
  getItemId: (item: T) => number;
  renderCard: (item: T, opts: { overlay?: boolean }) => ReactNode;
  onOpenItem: (item: T) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { column },
  });

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: column.color }}
          aria-hidden
        />
        <span className="text-sm font-medium text-text-primary">{column.name}</span>
        <span className="font-mono text-xs text-text-muted">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-2xl p-2 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-quiet)]",
          isOver ? "bg-surface-active" : "bg-surface-hover",
        )}
      >
        {items.map((item) => {
          const id = getItemId(item);
          return (
            <KanbanCardShell
              key={id}
              id={id}
              item={item}
              columnId={column.id}
              onOpen={onOpenItem}
            >
              {renderCard(item, {})}
            </KanbanCardShell>
          );
        })}
      </div>
    </div>
  );
}
