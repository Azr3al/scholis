import { Popover } from "@/components/primitives";
import ColorSelectorItem from "./color-selector-item";
import { InfoCircle as Info } from "iconoir-react";

interface IColorSelectorProps {
  color: {
    r: number;
    g: number;
    b: number;
  };
  setColor: (color: { r: number; g: number; b: number }) => void;
  label: string;
  presets?: { r: number; g: number; b: number }[];
  description?: string;
}

const ColorSelector: React.FC<IColorSelectorProps> = ({
  color,
  setColor,
  label,
  presets,
  description,
}) => {
  return (
    <>
      <div className="flex items-center gap-2">
        <p>{label}:</p>

        {description && (
          <Popover.Root>
            <Popover.Trigger
              type="button"
              className="inline-flex text-muted-foreground hover:text-foreground"
              aria-label="Color description"
            >
              <Info className="h-4 w-4" />
            </Popover.Trigger>
            <Popover.Portal>
        <Popover.Positioner>
        <Popover.Popup>
              <p>{description}</p>
            </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
          </Popover.Root>
        )}
        <div className="flex gap-3">
          {presets?.map((p) => (
            <ColorSelectorItem
            key={`${p.r}-${p.g}-${p.b}`}
              color={p}
              isCustom={false}
              onSelect={(c) => setColor(c)}
              isSelected={p.r === color.r && p.g === color.g && p.b === color.b}
            ></ColorSelectorItem>
          ))}
          <ColorSelectorItem
            color={color}
            setColor={setColor}
            isSelected={false}
            isCustom={true}
          ></ColorSelectorItem>
        </div>
      </div>
    </>
  );
};

export default ColorSelector;
