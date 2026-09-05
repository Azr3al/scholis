"use client";

import { updateEntity } from "@/app/client-api/utils";
import { column, type Column } from "@/components/data-table";
import { CellSaveFeedback, useCellAutosave } from "@/components/edit-kit";
import { Select } from "@/components/primitives";
import type { PaymentMethod } from "@/sdk";
import { PaymentBank } from "@/types/finance";

type CreatePaymentMethodColumnsOptions = {
  canEdit: boolean;
};

const PAYMENT_BANK_OPTIONS = Object.values(PaymentBank);

async function updatePaymentMethod(
  row: PaymentMethod,
  data: Record<string, unknown>,
) {
  await updateEntity("payment-methods", row.id, data);
}

function EditableBankCell({ row }: { row: PaymentMethod }) {
  const bankValue = row.payment_bank ?? "";
  const autosave = useCellAutosave({
    value: bankValue,
    onSave: async (next) => {
      await updatePaymentMethod(row, { payment_bank: next });
    },
  });

  return (
    <div className="flex min-w-min items-center gap-2">
      <Select
        value={autosave.displayValue || undefined}
        onValueChange={(next) => {
          if (!next) return;
          autosave.setLocalValue(String(next));
          void autosave.commit();
        }}
        disabled={autosave.status === "saving"}
        className="h-8 min-w-28 text-sm"
        placeholder="Select bank"
        items={PAYMENT_BANK_OPTIONS.map((bank) => ({
          value: bank,
          label: bank,
        }))}
      />
      <CellSaveFeedback
        status={autosave.status}
        showSavedTick={autosave.showSavedTick}
      />
    </div>
  );
}

export function createPaymentMethodColumns(
  options: CreatePaymentMethodColumnsOptions,
): Column<PaymentMethod>[] {
  const { canEdit } = options;

  if (!canEdit) {
    return [
      column.text<PaymentMethod>({
        id: "name",
        header: "Account Name",
        accessor: (row) => row.name,
        sizing: { role: "person" },
      }),
      column.text<PaymentMethod>({
        id: "bank_account_number",
        header: "Bank Account Number",
        accessor: (row) => row.bank_account_number,
        sizing: { role: "identifier", tabular: true },
      }),
      column.text<PaymentMethod>({
        id: "payment_bank",
        header: "Bank",
        accessor: (row) => row.payment_bank,
        sizing: { role: "prose" },
      }),
    ];
  }

  return [
    column.editableText<PaymentMethod>({
      id: "name",
      header: "Account Name",
      accessor: (row) => row.name,
      sizing: { role: "person" },
      onSave: async (row, value) => {
        await updatePaymentMethod(row, { name: value });
      },
    }),
    column.editableText<PaymentMethod>({
      id: "bank_account_number",
      header: "Bank Account Number",
      accessor: (row) => row.bank_account_number ?? "",
      sizing: { role: "identifier", tabular: true },
      onSave: async (row, value) => {
        await updatePaymentMethod(row, { bank_account_number: value || null });
      },
    }),
    {
      id: "payment_bank",
      header: "Bank",
      accessor: (row) => row.payment_bank,
      sizing: { role: "control" },
      enableSorting: true,
      cell: ({ row }) => <EditableBankCell row={row} />,
    },
  ];
}
