"use client";
import { Button, Tooltip, TooltipProvider, buttonVariants } from "@/components/primitives";

import { Editor } from "@tiptap/react";
import MarkMenu from "./mark-menu";
import { cn } from "@/lib/utils";
import Selector from "../form/selectors/selector";
import { ArrowDown as ArrowDownToLine, ArrowLeft as ArrowLeftToLine, ArrowRight as ArrowRightToLine, ArrowUp as ArrowUpToLine, ArrowSeparate as MoveHorizontal, ArrowSeparateVertical as MoveVertical, Trash as Trash2 } from "iconoir-react";

import { twMerge } from "tailwind-merge";
import { useKeyPress, useKeyPressEvent } from "react-use";
import { useEffect, useRef } from "react";
import { editorCanDeleteTable } from "@/helpers/tiptap-table-commands";
interface TableMenuProps {
  editor: Editor;
}

interface MenuButtonProps {
  children: React.ReactNode;
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  onClick: () => void;
}
const MenuButton: React.FC<MenuButtonProps> = ({
  children,
  label,
  variant = "primary",
  className,
  onClick,
}) => {
  return (
    <>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <Button
            size="sm"
            className={twMerge("h-6 w-6 rounded-none", className)}
            variant={variant}
            onClick={onClick}
          >
            {children}
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
        <Tooltip.Positioner>
        <Tooltip.Popup>{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
      </Tooltip.Root>
    </>
  );
};

const HoverMenu: React.FC<TableMenuProps> = ({ editor }) => {
  const inTable = () => {
    return (
      editor.isActive("table") ||
      editor.isActive("tableCell") ||
      editor.isActive("tableHeader") ||
      editor.isActive("tableRow")
    );
  };

  return (
    <div
      className={cn({
        hidden: !inTable(),
      })}
    >
      <Tooltip.Provider>
        <div className=" bg-card rounded-md space-x-1">
          <MenuButton
            onClick={() => {
              editor.chain().focus().addRowBefore().run();
            }}
            label="Insert row above"
          >
            <ArrowUpToLine className="h-3 w-3"></ArrowUpToLine>
          </MenuButton>
          <MenuButton
            onClick={() => {
              editor.chain().focus().addRowAfter().run();
            }}
            label="Insert row below"
          >
            <ArrowDownToLine className="h-3 w-3"></ArrowDownToLine>
          </MenuButton>
          <MenuButton
            onClick={() => {
              editor.chain().focus().addColumnBefore().run();
            }}
            label="Insert column before"
          >
            <ArrowLeftToLine className="h-3 w-3"></ArrowLeftToLine>
          </MenuButton>
          <MenuButton
            onClick={() => {
              editor.chain().focus().addColumnAfter().run();
            }}
            label="Insert column after"
          >
            <ArrowRightToLine className="h-3 w-3"></ArrowRightToLine>
          </MenuButton>
          <MenuButton
            onClick={() => {
              editor.chain().focus().deleteRow().run();
            }}
            className=" border-destructive"
            variant="secondary" label="Delete row"
          >
            <MoveHorizontal className="h-3 w-3 text-destructive"></MoveHorizontal>
          </MenuButton>
          <MenuButton
            onClick={() => {
              editor.chain().focus().deleteColumn().run();
            }}
            className=" border-destructive"
            variant="secondary" label="Delete column"
          >
            <MoveVertical className="h-3 w-3 text-destructive"></MoveVertical>
          </MenuButton>
          {editorCanDeleteTable(editor) ? (
            <MenuButton
              onClick={() => {
                editor.chain().focus().deleteTable().run();
              }}
              className="border-destructive"
              variant="danger" label="Delete table"
            >
              <Trash2 className="h-3 w-3" />
            </MenuButton>
          ) : null}
        </div>
      </Tooltip.Provider>
    </div>
  );
};

export default HoverMenu;
