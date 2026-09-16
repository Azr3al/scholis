"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { Bold, Italic, Underline } from "iconoir-react";

interface MarkMenuProps {
  editor: Editor;
}

const MarkMenu: React.FC<MarkMenuProps> = ({ editor }) => {
  return (
    <div className="space-x-1">
      <Button
        type="button"
        size="sm"
        variant={"ghost"}
        className={cn({
          "bg-muted": editor.isActive("bold"),
        })}
        onClick={() => {
          editor.chain().focus().toggleBold().run();
        }}
      >
        <Bold className=" h-4 w-4"></Bold>
      </Button>
      <Button
        type="button"
        size="sm"
        variant={"ghost"}
        className={cn({
          "bg-muted": editor.isActive("italic"),
        })}
        onClick={() => {
          editor.chain().focus().toggleItalic().run();
        }}
      >
        <Italic className=" h-4 w-4"></Italic>
      </Button>
      <Button
        type="button"
        size="sm"
        variant={"ghost"}
        className={cn({
          "bg-muted": editor.isActive("underline"),
        })}
        onClick={() => {
          editor.chain().focus().toggleUnderline().run();
        }}
      >
        <Underline className=" h-4 w-4"></Underline>
      </Button>
    </div>
  );
};

export default MarkMenu;
