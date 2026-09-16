import { Editor } from "@tiptap/react";
import Selector from "../form/selectors/selector";
import { Level } from "@tiptap/extension-heading";

interface HeadingMenuProps {
  editor: Editor;
  embedded?: boolean;
}

const HeadingMenu: React.FC<HeadingMenuProps> = ({ editor, embedded = false }) => {
  return (
    <Selector
      options={[
        {
          value: "1",
          label: "Title",
        },
        {
          value: "2",
          label: "Subtitle",
        },
        {
          value: "3",
          label: "Heading 1",
        },
        {
          value: "4",
          label: "Heading 2",
        },
        {
          value: "p",
          label: "Paragraph",
        },
      ]}
      value={
        editor.isActive("heading")
          ? String(editor.getAttributes("heading").level)
          : "p"
      }
      onChange={(v: string) => {
        if (v === "p") {
          editor.chain().focus().setParagraph().run();
          return;
        }

        editor
          .chain()
          .focus()
          .toggleHeading({ level: parseInt(v) as Level })
          .run();
      }}
      containerClassName="space-y-0"
      className={
        embedded
          ? "h-9 min-w-0 max-w-[11rem] flex-1 sm:h-10 sm:max-w-none sm:flex-none sm:w-[180px]"
          : undefined
      }
    ></Selector>
  );
};

export default HeadingMenu;
