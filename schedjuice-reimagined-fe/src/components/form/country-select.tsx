import { Select } from "@/components/primitives";

import { OptionalMark } from "@/components/form/required-mark";
import { countries } from "@/config/countries";

interface ICountrySelectProps {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  isRequired?: boolean;
  showOptional?: boolean;
  formDescription?: string;
  disabled?: boolean;
}

const CountrySelect: React.FC<ICountrySelectProps> = ({
  value,
  onChange,
  label = "Country",
  isRequired,
  showOptional = false,
  formDescription,
  disabled = false,
}) => {
  return (
    <div className="space-y-3">
      <label>
        {label} {isRequired && <span className=" text-destructive">*</span>}
        {showOptional && !isRequired ? <OptionalMark /> : null}
      </label>
      <Select
        value={value}
        onValueChange={(v) => onChange(String(v ?? ""))}
        disabled={disabled}
        className="w-full"
        placeholder="Select a country"
        items={countries.map((c) => ({ value: c.code, label: c.name }))}
      />
      {formDescription && <p>{formDescription}</p>}
    </div>
  );
};

export default CountrySelect;
