"use client";

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";

/**
 * Draggable chrome around a domain card's content. Domains own their own
 * `renderCard` visuals (see `KanbanBoard`); this shell only wires up
 * `@dnd-kit` dragging, the opacity-while-dragging state, and the click-to-open
 * affordance shared by every board.
 */
export function KanbanCardShell<T>({
  id,
  item,
  columnId,
  onOpen,
  children,
}: {
  id: number;
  item: T;
  columnId: number;
  onOpen: (item: T) => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { item, columnId },
  });

  return (
    <button
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: "none" }}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(item)}
      className="block w-full rounded-xl text-left transition-[opacity,border-color] duration-[var(--duration-fast)] ease-[var(--ease-quiet)] hover:[&>div]:border-border-strong"
    >
      {children}
    </button>
  );
}
