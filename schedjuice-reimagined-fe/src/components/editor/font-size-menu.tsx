import type { Editor } from "@tiptap/react";
import Selector from "../form/selectors/selector";

export type AnnouncementFontSize = "0.875rem" | "1rem" | "1.875rem";

export const ANNOUNCEMENT_FONT_SIZE_LABELS: Record<
  AnnouncementFontSize,
  string
> = {
  "0.875rem": "Small",
  "1rem": "Normal",
  "1.875rem": "Large",
};

interface FontSizeMenuProps {
  editor: Editor;
  embedded?: boolean;
}

const FONT_SIZE_OPTIONS = (
  Object.entries(ANNOUNCEMENT_FONT_SIZE_LABELS) as [AnnouncementFontSize, string][]
).map(([value, label]) => ({ value, label }));

function currentFontSize(editor: Editor): AnnouncementFontSize {
  const attrs = editor.getAttributes("textStyle");
  const size = attrs.fontSize as AnnouncementFontSize | undefined;
  if (size && size in ANNOUNCEMENT_FONT_SIZE_LABELS) return size;
  return "1rem";
}

const FontSizeMenu: React.FC<FontSizeMenuProps> = ({
  editor,
  embedded = false,
}) => {
  return (
    <Selector
      options={FONT_SIZE_OPTIONS}
      value={currentFontSize(editor)}
      onChange={(value: string) => {
        const size = value as AnnouncementFontSize;
        if (size === "1rem") {
          editor.chain().focus().unsetFontSize().run();
          return;
        }
        editor.chain().focus().setFontSize(size).run();
      }}
      containerClassName="space-y-0"
      className={
        embedded
          ? "h-9 min-w-0 max-w-[6.5rem] flex-1 sm:h-10 sm:max-w-none sm:flex-none sm:w-[110px]"
          : undefined
      }
    />
  );
};

export default FontSizeMenu;
