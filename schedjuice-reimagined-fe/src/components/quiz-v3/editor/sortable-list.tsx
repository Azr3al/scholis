"use client";

import { cn } from "@/lib/utils";
import { Reorder, useDragControls } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";

export type DragHandleProps = {
  onPointerDown: (e: PointerEvent) => void;
  style: CSSProperties;
};

export type SortableRenderArgs<T> = {
  item: T;
  index: number;
  dragHandle: DragHandleProps;
  isDragging: boolean;
};

export type SortableListProps<T> = {
  items: T[];
  getItemId: (item: T) => string | number;
  onReorder: (orderedItems: T[]) => void;
  renderItem: (args: SortableRenderArgs<T>) => ReactNode;
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
  "aria-label"?: string;
};

const NOOP_DRAG_HANDLE: DragHandleProps = {
  onPointerDown: () => {},
  style: { touchAction: "none" },
};

function itemsSignature<T>(
  items: T[],
  getItemId: (item: T) => string | number
): string {
  return items.map(getItemId).join("|");
}

type SortableItemProps<T> = {
  item: T;
  index: number;
  renderItem: (args: SortableRenderArgs<T>) => ReactNode;
  itemClassName?: string;
  onDragStart: () => void;
  onDragEnd: () => void;
};

function SortableItem<T>({
  item,
  index,
  renderItem,
  itemClassName,
  onDragStart,
  onDragEnd,
}: SortableItemProps<T>) {
  const controls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);

  const dragHandle: DragHandleProps = {
    onPointerDown: (e) => controls.start(e),
    style: { touchAction: "none" },
  };

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      layout
      className={cn(
        "relative bg-surface",
        isDragging && "z-30",
        itemClassName
      )}
      style={{ position: "relative", zIndex: isDragging ? 50 : 0 }}
      onDragStart={() => {
        setIsDragging(true);
        onDragStart();
      }}
      onDragEnd={() => {
        setIsDragging(false);
        onDragEnd();
      }}
    >
      {renderItem({ item, index, dragHandle, isDragging })}
    </Reorder.Item>
  );
}

export function SortableList<T>({
  items,
  getItemId,
  onReorder,
  renderItem,
  disabled = false,
  className,
  itemClassName,
  "aria-label": ariaLabel,
}: SortableListProps<T>) {
  const signature = useMemo(
    () => itemsSignature(items, getItemId),
    [items, getItemId]
  );
  const [local, setLocal] = useState(items);
  const localRef = useRef(items);
  localRef.current = local;
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setLocal(items);
  }, [signature, items]);

  const handleReorder = useCallback((next: T[]) => {
    setLocal(next);
    localRef.current = next;
  }, []);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const commitReorder = useCallback(() => {
    isDraggingRef.current = false;
    onReorder(localRef.current);
  }, [onReorder]);

  if (disabled) {
    return (
      <ul className={cn("m-0 list-none p-0", className)} aria-label={ariaLabel}>
        {items.map((item, index) => (
          <li key={getItemId(item)} className={itemClassName}>
            {renderItem({
              item,
              index,
              dragHandle: NOOP_DRAG_HANDLE,
              isDragging: false,
            })}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={local}
      onReorder={handleReorder}
      as="ul"
      className={cn("m-0 list-none p-0", className)}
      aria-label={ariaLabel}
    >
      {local.map((item, index) => (
        <SortableItem
          key={getItemId(item)}
          item={item}
          index={index}
          renderItem={renderItem}
          itemClassName={itemClassName}
          onDragStart={handleDragStart}
          onDragEnd={commitReorder}
        />
      ))}
    </Reorder.Group>
  );
}
