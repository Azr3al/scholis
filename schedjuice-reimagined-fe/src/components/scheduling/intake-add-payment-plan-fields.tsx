"use client";

import EntityCombobox from "@/components/form/entity-combobox";
import { Button } from "@/components/primitives";
import {
  getEffectivePaymentPlanId,
  rowHasCustomPaymentPlan,
} from "@/helpers/intake-preview";
import { usePaymentPlanOptionLabel } from "@/hooks/usePaymentPlanOptionLabel";

export type IntakeAddPaymentPlanState = {
  defaultPaymentPlanId: number | undefined;
  paymentPlanOverrides: Record<string, number>;
};

export function IntakeAddDefaultPaymentPlanField({
  defaultPaymentPlanId,
  onChange,
}: {
  defaultPaymentPlanId: number | undefined;
  onChange: (planId: number | undefined) => void;
}) {
  const paymentPlanOptionLabel = usePaymentPlanOptionLabel();
  return (
    <EntityCombobox
      entity="payment-plans"
      displayFunction={paymentPlanOptionLabel}
      value={defaultPaymentPlanId != null ? String(defaultPaymentPlanId) : ""}
      onChange={(value) => onChange(value ? parseInt(value, 10) : undefined)}
      label="Default payment plan · optional"
      emptyOption={{ value: "", label: "None" }}
      comboboxPlaceholder="None"
    />
  );
}

export function IntakeAddRowPaymentPlanField({
  rowKey,
  state,
  onSetOverride,
  onClearOverride,
}: {
  rowKey: string;
  state: IntakeAddPaymentPlanState;
  onSetOverride: (rowKey: string, planId: number | undefined) => void;
  onClearOverride: (rowKey: string) => void;
}) {
  const paymentPlanOptionLabel = usePaymentPlanOptionLabel();
  const effectiveId = getEffectivePaymentPlanId(
    rowKey,
    state.defaultPaymentPlanId,
    state.paymentPlanOverrides,
  );
  const hasCustom = rowHasCustomPaymentPlan(rowKey, state.paymentPlanOverrides);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <EntityCombobox
            entity="payment-plans"
            displayFunction={paymentPlanOptionLabel}
            value={effectiveId != null ? String(effectiveId) : ""}
            onChange={(value) =>
              onSetOverride(rowKey, value ? parseInt(value, 10) : undefined)
            }
            label="Payment plan · optional"
            emptyOption={{ value: "", label: "None" }}
            comboboxPlaceholder="None"
          />
        </div>
        {hasCustom ? (
          <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary mb-1">
            Custom payment plan
          </span>
        ) : null}
      </div>
      {hasCustom ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onClearOverride(rowKey)}
        >
          Use default payment plan
        </Button>
      ) : null}
    </div>
  );
}
