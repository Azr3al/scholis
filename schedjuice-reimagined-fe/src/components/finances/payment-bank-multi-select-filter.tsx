"use client";

import { MultiCombobox } from "@/components/form/multi-combo-box";
import { FilterToolbarField } from "@/components/filters/filter-toolbar";
import { PaymentBank } from "@/types/finance";
import { Xmark } from "iconoir-react";

const PAYMENT_BANK_OPTIONS = Object.values(PaymentBank).map((bank) => ({
  value: bank,
  label: bank,
}));

type PaymentBankFilterProps = {
  selectedBanks: PaymentBank[];
  onSelectedBanksChange: (banks: PaymentBank[]) => void;
};

export function PaymentBankMultiSelectFilter({
  selectedBanks,
  onSelectedBanksChange,
}: PaymentBankFilterProps) {
  const selectedBankValues = selectedBanks.map(String);

  return (
    <FilterToolbarField label="Bank" width="md">
      <MultiCombobox
        options={PAYMENT_BANK_OPTIONS}
        value={selectedBankValues}
        onChange={(next) => onSelectedBanksChange(next as PaymentBank[])}
        triggerLabel="Add bank"
        triggerClassName="h-10 w-full justify-between"
        placeholder="Search banks…"
      />
    </FilterToolbarField>
  );
}

export function PaymentBankFilterChips({
  selectedBanks,
  onSelectedBanksChange,
}: PaymentBankFilterProps) {
  return (
    <div
      className="flex h-9 min-h-9 min-w-0 items-center gap-1.5 overflow-x-auto"
      aria-label={
        selectedBanks.length
          ? `Selected banks: ${selectedBanks.join(", ")}`
          : undefined
      }
    >
      {selectedBanks.map((bank) => (
        <span
          key={bank}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-foreground"
        >
          <span>{bank}</span>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 hover:bg-muted"
            aria-label={`Remove ${bank}`}
            onClick={() =>
              onSelectedBanksChange(
                selectedBanks.filter((selected) => selected !== bank),
              )
            }
          >
            <Xmark className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
