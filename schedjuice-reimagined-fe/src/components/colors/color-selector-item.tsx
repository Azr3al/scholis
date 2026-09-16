import { rgbToHex } from "@/helpers/colors";
import { cn } from "@/lib/utils";
import { useRef } from "react";

interface IColorSelectorItemProps {
  color: {
    r: number;
    g: number;
    b: number;
  };
  setColor?: (color: { r: number; g: number; b: number }) => void;
  isSelected: boolean;
  isCustom: boolean;
  onSelect?: (color: { r: number; g: number; b: number }) => void;
}

const ColorSelectorItem: React.FC<IColorSelectorItemProps> = ({
  color,
  setColor,
  isSelected,
  isCustom,
  onSelect,
}) => {
  const colorPickerRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {isCustom ? (
        <div
          className="w-8 h-8 rounded-full relative border-[6px]"
          style={{
            borderColor: `rgb(${color.r}, ${color.g}, ${color.b})`,
            background:
              "conic-gradient(hsl(0deg 100% 50%), hsl(10deg 100% 50%), hsl(20deg 100% 50%), hsl(30deg 100% 50%), hsl(40deg 100% 50%), hsl(50deg 100% 50%), hsl(60deg 100% 50%), hsl(70deg 100% 50%), hsl(80deg 100% 50%), hsl(90deg 100% 50%), hsl(100deg 100% 50%), hsl(110deg 100% 50%), hsl(120deg 100% 50%), hsl(130deg 100% 50%), hsl(140deg 100% 50%), hsl(150deg 100% 50%), hsl(160deg 100% 50%), hsl(170deg 100% 50%), hsl(180deg 100% 50%), hsl(190deg 100% 50%), hsl(200deg 100% 50%), hsl(210deg 100% 50%), hsl(220deg 100% 50%), hsl(230deg 100% 50%), hsl(240deg 100% 50%), hsl(250deg 100% 50%), hsl(260deg 100% 50%), hsl(270deg 100% 50%), hsl(280deg 100% 50%), hsl(290deg 100% 50%), hsl(300deg 100% 50%), hsl(310deg 100% 50%), hsl(320deg 100% 50%), hsl(330deg 100% 50%), hsl(340deg 100% 50%), hsl(350deg 100% 50%))",

            boxShadow: `0 0 0 4px white inset`,
            boxSizing: "border-box",
          }}
        >
          <input
            type="color"
            onClick={() => {
              if (colorPickerRef.current) {
                colorPickerRef.current.click();
              }
            }}
            className=" h-[100%] w-[100%] opacity-0 absolute bottom-[0%] top-0 left-0 cursor-pointer "
            ref={colorPickerRef}
            value={rgbToHex(color.r, color.g, color.b)}
            onChange={(e) => {
              const hex = e.target.value;
              const r = parseInt(hex.slice(1, 3), 16);
              const g = parseInt(hex.slice(3, 5), 16);
              const b = parseInt(hex.slice(5, 7), 16);
              setColor!({ r, g, b });
            }}
          ></input>
        </div>
      ) : (
        <div
          onClick={() => onSelect!(color)}
          className={cn({
            "w-8 h-8 rounded-full  cursor-pointer": true,
            "border-2 border-primary border-spacing-2": isSelected,
          })}
          style={{
            background: `rgb(${color.r}, ${color.g}, ${color.b})`,
            boxShadow: "0 0 0 2px white inset",
            boxSizing: "border-box",
          }}
        ></div>
      )}
    </>
  );
};

export default ColorSelectorItem;
