"use client";

import { Menu } from "@/components/primitives";

export type PaymentColumnHeaderMenuTarget = {
  columnId: "user__name" | "user__email" | "parsed_amount";
  rect: { x: number; y: number; width: number; height: number };
  sorted: "asc" | "desc" | false;
};

export function PaymentColumnHeaderMenuOverlay({
  target,
  onClose,
  onSortAsc,
  onSortDesc,
  onClearSort,
  onCopy,
  showSort = true,
}: {
  target: PaymentColumnHeaderMenuTarget | null;
  onClose: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort: () => void;
  onCopy: () => void;
  showSort?: boolean;
}) {
  if (!target) return null;

  return (
    <Menu.Root open onOpenChange={(open) => !open && onClose()}>
      <Menu.Trigger
        render={
          <div
            style={{
              position: "fixed",
              left: target.rect.x,
              top: target.rect.y,
              width: Math.max(target.rect.width, 1),
              height: target.rect.height,
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="start">
          <Menu.Popup
            style={{
              position: "fixed",
              left: target.rect.x,
              top: target.rect.y + target.rect.height + 4,
            }}
          >
            {showSort ? (
              <>
                <Menu.Item
                  onClick={() => {
                    onSortAsc();
                    onClose();
                  }}
                >
                  Sort ascending
                </Menu.Item>
                <Menu.Item
                  onClick={() => {
                    onSortDesc();
                    onClose();
                  }}
                >
                  Sort descending
                </Menu.Item>
                {target.sorted ? (
                  <Menu.Item
                    onClick={() => {
                      onClearSort();
                      onClose();
                    }}
                  >
                    Clear sort
                  </Menu.Item>
                ) : null}
                <Menu.Separator />
              </>
            ) : null}
            <Menu.Item
              onClick={() => {
                onCopy();
                onClose();
              }}
            >
              Copy column
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
