import { Select } from "@/components/primitives";

interface ITextColorSelectorProps {
  color: "black" | "white";
  setColor: (color: "black" | "white") => void;
  label: string;
  disabled?: boolean;
}
const TextColorSelector: React.FC<ITextColorSelectorProps> = ({
  color,
  setColor,
  label,
  disabled = false,
}) => {
  return (
    <>
      <div className="space-y-3">
        <label>{label}</label>
        <Select
          value={color}
          onValueChange={(v) => setColor(v as "black" | "white")}
          disabled={disabled}
          items={[
            { value: "black", label: "Black" },
            { value: "white", label: "White" },
          ]}
        />
      </div>
    </>
  );
};

export default TextColorSelector;
