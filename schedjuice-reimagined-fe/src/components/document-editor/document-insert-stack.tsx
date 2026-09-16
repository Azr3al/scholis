"use client";

import { Button, Menu } from "@/components/primitives";
import { VARIABLE_OPTIONS } from "@/lib/document-template/sample-binder";
import type { InsertableBlockType } from "@/lib/document-template/types";
import { Hashtag, MediaImage, Page, Table2Columns, Text } from "iconoir-react";

export function DocumentInsertStack({
  onInsert,
  onInsertVariable,
  variablesEnabled,
}: {
  onInsert: (type: InsertableBlockType) => void;
  onInsertVariable: (key: string) => void;
  variablesEnabled: boolean;
}) {
  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-full border border-border bg-surface-elevated p-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Text"
        className="size-8 px-0"
        onClick={() => onInsert("text")}
      >
        <Text width={18} height={18} aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Image"
        className="size-8 px-0"
        onClick={() => onInsert("image")}
      >
        <MediaImage width={18} height={18} aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Layout"
        className="size-8 px-0"
        onClick={() => onInsert("columns")}
      >
        <Page width={18} height={18} aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Table"
        className="size-8 px-0"
        onClick={() => onInsert("grades_table")}
      >
        <Table2Columns width={18} height={18} aria-hidden />
      </Button>
      <Menu.Root>
        <Menu.Trigger
          disabled={!variablesEnabled}
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Variables"
              className="size-8 px-0"
              disabled={!variablesEnabled}
            >
              <Hashtag width={18} height={18} aria-hidden />
            </Button>
          }
        />
        <Menu.Portal>
          <Menu.Positioner side="right" align="start">
            <Menu.Popup>
              {VARIABLE_OPTIONS.map((item) => (
                <Menu.Item
                  key={item.key}
                  className="justify-start"
                  onClick={() => onInsertVariable(item.key)}
                >
                  {item.label}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
