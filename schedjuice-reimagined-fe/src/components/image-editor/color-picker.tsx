import { useRef } from "react";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  icon: React.ReactNode;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, icon }) => {
  const colorPickerRef = useRef<HTMLInputElement>(null);

  return (
    <div
    onClick={() => {
      if (colorPickerRef.current) {
        colorPickerRef.current.click();
      }
    }}
    className="flex flex-col gap-0 relative items-center hover:bg-muted p-2 roudned-lg cursor-pointer"
  >
    {icon}

    <input
      ref={colorPickerRef}
      type="color"
      className="h-3 w-6 absolute bottom-[0%]"
      value={color}
    onChange={(e) => onChange(e.target.value)}
    ></input>
  </div>
  )
};

export default ColorPicker;
