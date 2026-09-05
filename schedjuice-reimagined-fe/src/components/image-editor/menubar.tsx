import { Button, Input, Select, buttonVariants, inputClassName } from "@/components/primitives";
import { Palette, Text } from "iconoir-react";
import ColorSelector from "../colors/color-selector";
import { useEffect, useRef, useState } from "react";
import ColorPicker from "./color-picker";
import useImageEditorStore from "@/store/image-editor";
import { TextElement } from "@/helpers/image-editor/text";
import { availableFonts } from "@/helpers/image-editor/fonts";
import { getNewTextElement } from "@/helpers/image-editor/functions";
interface MenubarProps {
  drawBgImage: any;
}

const Menubar: React.FC<MenubarProps> = ({ drawBgImage }) => {
  const {
    lastSelectedElementIndex,
    elements,
    modifyAndDrawElement,
    removeElement,
  } = useImageEditorStore();

  const selectedTextElement =
    lastSelectedElementIndex === null
      ? null
      : elements.find((element) => element.index === lastSelectedElementIndex) || null;

  return (
    <div className="flex  justify-between min-h-10">
      {selectedTextElement && (
        <>
          <div className="flex gap-3">
            <div className=" w-32 bg-background">
              <Select
                value={selectedTextElement.fontFamily}
                onValueChange={(v) => {
                  const newText = getNewTextElement(selectedTextElement);
                  newText.fontFamily = String(v ?? "");

                  modifyAndDrawElement(
                    selectedTextElement.index,
                    newText,
                    drawBgImage,
                  );
                }}
                className="w-full"
                placeholder="Font Style"
                items={availableFonts.map((font) => ({
                  value: font.value,
                  label: font.label,
                }))}
              />
            </div>
            <div className="w-20 bg-background">
              <Input
                type="number"
                value={selectedTextElement.fontSize}
                onChange={(e) => {
                  const newText = getNewTextElement(selectedTextElement);
                  newText.fontSize = parseInt(e.target.value);

                  modifyAndDrawElement(
                    selectedTextElement.index,
                    newText,
                    drawBgImage
                  );
                }}
              ></Input>
            </div>

            <ColorPicker
              color={selectedTextElement.color}
              onChange={(color) => {
                const newText = getNewTextElement(selectedTextElement);
                newText.color = color;

                modifyAndDrawElement(
                  selectedTextElement.index,
                  newText,
                  drawBgImage
                );
              }}
              icon={<p>A</p>}
            ></ColorPicker>

            <Input
              value={selectedTextElement.text}
              onChange={(event) => {
                const newText = getNewTextElement(selectedTextElement);
                newText.text = event.target.value;

                modifyAndDrawElement(
                  selectedTextElement.index,
                  newText,
                  drawBgImage
                );
              }}
              className="bg-background"
            ></Input>
          </div>
          <Button
            variant="danger"
            onClick={() => {
              removeElement(selectedTextElement.index, drawBgImage);
            }}
          >
            Remove
          </Button>
        </>
      )}
    </div>
  );
};

export default Menubar;
