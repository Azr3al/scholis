"use client";
import { Menu } from "@/components/primitives";

export interface ContextMenuTarget {
  x: number;
  y: number;
}

export interface SheetContextMenuProps {
  target: ContextMenuTarget | null;
  onClose: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onClear?: () => void;
  onInsertAbove?: () => void;
  onInsertBelow?: () => void;
  onDuplicate?: () => void;
  onDeleteRows?: () => void;
}

export function SheetContextMenu({
  target,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onClear,
  onInsertAbove,
  onInsertBelow,
  onDuplicate,
  onDeleteRows,
}: SheetContextMenuProps) {
  const open = target !== null;
  const hasRowOps =
    onInsertAbove || onInsertBelow || onDuplicate || onDeleteRows;

  return (
    <Menu.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Menu.Trigger render={<span
          aria-hidden
          style={{
            position: "fixed",
            left: target?.x ?? 0,
            top: target?.y ?? 0,
            width: 0,
            height: 0,
          }}
        />} />
      <Menu.Portal>
        <Menu.Positioner align="start">
        <Menu.Popup className="min-w-44">
        {onCut ? (
          <Menu.Item
            onSelect={() => {
              onCut();
              onClose();
            }}
          >
            Cut
          </Menu.Item>
        ) : null}
        {onCopy ? (
          <Menu.Item
            onSelect={() => {
              onCopy();
              onClose();
            }}
          >
            Copy
          </Menu.Item>
        ) : null}
        {onPaste ? (
          <Menu.Item
            onSelect={() => {
              onPaste();
              onClose();
            }}
          >
            Paste
          </Menu.Item>
        ) : null}
        {onClear ? (
          <Menu.Item
            onSelect={() => {
              onClear();
              onClose();
            }}
          >
            Clear contents
          </Menu.Item>
        ) : null}
        {hasRowOps ? <Menu.Separator /> : null}
        {onInsertAbove ? (
          <Menu.Item
            onSelect={() => {
              onInsertAbove();
              onClose();
            }}
          >
            Insert row above
          </Menu.Item>
        ) : null}
        {onInsertBelow ? (
          <Menu.Item
            onSelect={() => {
              onInsertBelow();
              onClose();
            }}
          >
            Insert row below
          </Menu.Item>
        ) : null}
        {onDuplicate ? (
          <Menu.Item
            onSelect={() => {
              onDuplicate();
              onClose();
            }}
          >
            Duplicate row
          </Menu.Item>
        ) : null}
        {onDeleteRows ? (
          <Menu.Item
            className="text-destructive"
            onSelect={() => {
              onDeleteRows();
              onClose();
            }}
          >
            Delete row(s)
          </Menu.Item>
        ) : null}
      </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
