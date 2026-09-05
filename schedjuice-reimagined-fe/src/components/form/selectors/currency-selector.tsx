import type { ReactNode } from "react";
import { Select } from "@/components/primitives";

export type CurrencyOption = {
  currency_fullname: string;
  currency_symbol: string;
  currency_iso4217: string;
};

export const currencies: CurrencyOption[] = [
  {
    currency_fullname: "Myanmar Kyat",
    currency_symbol: "Ks",
    currency_iso4217: "MMK",
  },
  {
    currency_fullname: "Thai Baht",
    currency_symbol: "฿",
    currency_iso4217: "THB",
  },
  {
    currency_fullname: "United States Dollar",
    currency_symbol: "$",
    currency_iso4217: "USD",
  },
  {
    currency_fullname: "Singapore Dollar",
    currency_symbol: "S$",
    currency_iso4217: "SGD",
  },
  {
    currency_fullname: "Euro",
    currency_symbol: "€",
    currency_iso4217: "EUR",
  },
  {
    currency_fullname: "British Pound",
    currency_symbol: "£",
    currency_iso4217: "GBP",
  },
];

interface CurrencySelectorProps {
  /** ISO 4217 code, e.g. MMK */
  value: string;
  onChange: (iso4217: string) => void;
  onSelectCurrency?: (row: CurrencyOption) => void;
  label?: string;
  isRequired?: boolean;
  formDescription?: ReactNode;
  disabled?: boolean;
  triggerClassName?: string;
}

const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  value,
  onChange,
  onSelectCurrency,
  label = "Currency",
  isRequired = false,
  formDescription,
  disabled = false,
  triggerClassName,
}) => {
  return (
    <div>
      <label>
        {label}{" "}
        {isRequired && <span className="text-sm text-destructive">*</span>}
      </label>
      <Select
        value={value}
        onValueChange={(iso4217) => {
          const next = String(iso4217 ?? "");
          onChange(next);
          const row = currencies.find((c) => c.currency_iso4217 === next);
          if (row) onSelectCurrency?.(row);
        }}
        disabled={disabled}
        className={triggerClassName ?? "max-w-[280px]"}
        placeholder={label}
        items={currencies.map((c) => ({
          value: c.currency_iso4217,
          label: `${c.currency_fullname} (${c.currency_symbol}) (${c.currency_iso4217})`,
        }))}
      />
      {formDescription && <p>{formDescription}</p>}
    </div>
  );
};

export default CurrencySelector;
