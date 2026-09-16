"use client";

import { useState, type ReactNode } from "react";
import { MoreHoriz as Ellipsis } from "iconoir-react";

import { Button, Dialog, Menu } from "@/components/primitives";

export type FeedPostMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

export type FeedPostActionsMenuProps = {
  items: FeedPostMenuItem[];
  deleteDialog?: {
    title: string;
    description: ReactNode;
    confirmLabel?: string;
    onConfirm: () => void;
    isLoading?: boolean;
  };
};

export function FeedPostActionsMenu({
  items,
  deleteDialog,
}: FeedPostActionsMenuProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0"
              aria-label="Post actions"
            />
          }
        >
          <Ellipsis className="h-4 w-4" aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end">
            <Menu.Popup>
              {items.map((item) => (
                <Menu.Item
                  key={item.id}
                  onClick={() => {
                    if (item.id === "delete" && deleteDialog) {
                      setDeleteOpen(true);
                      return;
                    }
                    item.onSelect();
                  }}
                  className={
                    item.destructive
                      ? "text-destructive focus:text-destructive"
                      : undefined
                  }
                >
                  {item.label}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {deleteDialog ? (
        <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
          <Dialog.Portal>
            <Dialog.Backdrop />
            <Dialog.Popup>
              <Dialog.Title>{deleteDialog.title}</Dialog.Title>
              <div className="text-sm text-muted-foreground">
                {deleteDialog.description}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleteDialog.isLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  isLoading={deleteDialog.isLoading}
                  onClick={() => {
                    deleteDialog.onConfirm();
                  }}
                >
                  {deleteDialog.confirmLabel ?? "Delete"}
                </Button>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </>
  );
}
