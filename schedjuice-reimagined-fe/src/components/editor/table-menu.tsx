"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { Editor } from "@tiptap/react";
import { insertQuizTableWithTrailingParagraph } from "./insert-quiz-table";
import { Table, Trash } from "iconoir-react";
import { editorCanDeleteTable } from "@/helpers/tiptap-table-commands";

interface TableMenuProps {
  editor: Editor;
}

const TableMenu: React.FC<TableMenuProps> = ({ editor }) => {
  return (
    <div>
      <Button
        type="button"
        onClick={() => insertQuizTableWithTrailingParagraph(editor)}
        variant={"ghost"}
        size="sm"
      >
        <Table></Table>
      </Button>
      {editorCanDeleteTable(editor) && (
        <Button
          type="button"
          variant={"ghost"}
          size="sm"
          onClick={() => {
            editor.chain().focus().deleteTable().run();
          }}
        >
          <Trash className=" text-destructive"></Trash>
        </Button>
      )}
    </div>
  );
};

export default TableMenu;
