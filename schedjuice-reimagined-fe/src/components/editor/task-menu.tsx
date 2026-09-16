"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { Editor } from "@tiptap/react";
import { TaskList as ListTodo } from "iconoir-react";

interface TaskMenuProps {
  editor: Editor;
}

const TaskMenu: React.FC<TaskMenuProps> = ({ editor }) => {
  return (
    <div>
      <Button
        type="button"
        variant={"ghost"}
        size="sm"
        onClick={() => {
          editor.chain().focus().toggleTaskList().run();
        }}
      >
        <ListTodo></ListTodo>
      </Button>
    </div>
  );
};

export default TaskMenu;
