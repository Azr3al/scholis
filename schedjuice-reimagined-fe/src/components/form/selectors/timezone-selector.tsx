import { Select } from "@/components/primitives";

const timezoneCodes: string[] = [
  "UTC",
  "Asia/Rangoon",
  "Asia/Bangkok",
  "Asia/Singapore",
];

interface TimezoneSelectorProps {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  isRequired?: boolean;
  formDescription?: string;
  disabled?: boolean;
}

const TimezoneSelector: React.FC<TimezoneSelectorProps> = ({
  value,
  onChange,
  label = "Timezone",
  isRequired = false,
  formDescription,
  disabled = false,
}) => {
  return (
    <div>
      <label>
        {label} {isRequired && <span className="text-destructive">*</span>}
      </label>
      <Select
        value={value}
        onValueChange={(v) => {
          onChange(String(v ?? ""));
        }}
        disabled={disabled}
        className="max-w-[280px]"
        placeholder={label}
        items={timezoneCodes.map((timezone) => ({
          value: timezone,
          label: timezone,
        }))}
      />
      {formDescription && <p>{formDescription}</p>}
    </div>
  );
};

export default TimezoneSelector;
