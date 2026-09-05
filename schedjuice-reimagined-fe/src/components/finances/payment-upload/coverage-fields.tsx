"use client";

import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { Label } from "@/app/_chrome/label";
import {
  Button,
  Checkbox,
  Input,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
} from "@/components/primitives";
import { getCourseMonthType } from "@/helpers/date";
import {
  monthKey,
  type CoverageMonthOption,
} from "@/helpers/payment-coverage-months";
import {
  INSTALLMENT_PERCENT_PRESETS,
  PAYMENT_PLAN_OPTIONS,
  type CoveragePlanState,
  type PaymentPlanMode,
} from "@/lib/finances/payment-coverage-plan";
import { cn } from "@/lib/utils";
import { DefaultStudentPaymentPlan } from "@/types/organization";

export type CoverageFieldsProps = {
  plan: CoveragePlanState;
  onChange: (next: CoveragePlanState) => void;
  selectableMonths: CoverageMonthOption[];
  courseStartDate?: string | null;
  scheduleLoading?: boolean;
  scheduleError?: boolean;
  disabled?: boolean;
  planError?: string;
  planErrorFieldName?: string;
  clampNote?: string | null;
  legend?: string;
  idPrefix?: string;
};

function isPaymentPlanMode(value: string): value is PaymentPlanMode {
  return (
    value === DefaultStudentPaymentPlan.single_month ||
    value === DefaultStudentPaymentPlan.multiple_months ||
    value === DefaultStudentPaymentPlan.installment
  );
}

export function CoverageFields({
  plan,
  onChange,
  selectableMonths,
  courseStartDate,
  scheduleLoading = false,
  scheduleError = false,
  disabled = false,
  planError,
  planErrorFieldName = "upload-plan-error",
  clampNote,
  legend = "Payment plan",
  idPrefix = "coverage",
}: CoverageFieldsProps) {
  const patch = (partial: Partial<CoveragePlanState>) =>
    onChange({ ...plan, ...partial });

  return (
    <div className="space-y-3">
      <fieldset className="m-0 space-y-3 border-0 p-0">
        <legend className="text-sm font-medium">{legend}</legend>
        <RadioGroup
          value={plan.mode}
          onValueChange={(v) => {
            const value = String(v);
            if (isPaymentPlanMode(value)) {
              patch({ mode: value });
            }
          }}
          disabled={disabled}
          className="grid gap-2 sm:grid-cols-3"
        >
          {PAYMENT_PLAN_OPTIONS.map((opt) => {
            const inputId = `${idPrefix}-plan-${opt.value}`;
            const selected = plan.mode === opt.value;
            return (
              <label
                key={opt.value}
                htmlFor={inputId}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-muted/20 hover:bg-muted/40",
                  disabled && "cursor-not-allowed opacity-70",
                )}
              >
                <div className="flex items-start gap-2">
                  <Radio
                    value={opt.value}
                    id={inputId}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <p className="text-xs text-text-muted">{opt.description}</p>
                  </div>
                </div>
              </label>
            );
          })}
        </RadioGroup>
      </fieldset>

      {plan.mode === DefaultStudentPaymentPlan.single_month ? (
        <div className="space-y-1">
          <YearMonthSelector
            date={plan.monthDate}
            setDate={(next) => {
              const monthDate = new Date(
                next.getFullYear(),
                next.getMonth(),
                1,
              );
              const key = monthKey(monthDate.getFullYear(), monthDate.getMonth() + 1);
              patch({
                monthDate,
                selectedMonthKeys: new Set([key]),
                installmentThroughKey: key,
              });
            }}
            label="Billing month"
            fullWidth
            monthType={
              courseStartDate ? getCourseMonthType(courseStartDate) : null
            }
          />
          {clampNote ? (
            <p className="text-xs text-text-muted">{clampNote}</p>
          ) : null}
        </div>
      ) : null}

      {plan.mode === DefaultStudentPaymentPlan.multiple_months ? (
        scheduleLoading ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Months covered</p>
            <Skeleton className="h-36 w-full rounded-md" aria-busy="true" />
          </div>
        ) : scheduleError ? (
          <p className="text-sm text-danger" role="alert">
            Could not load this class&apos;s schedule dates. Refresh the page or
            try again.
          </p>
        ) : selectableMonths.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                className="text-sm font-medium"
                id={`${idPrefix}-months-covered-label`}
              >
                Months covered
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={disabled}
                  onClick={() => {
                    patch({
                      selectedMonthKeys: new Set(
                        selectableMonths.map((m) =>
                          monthKey(m.year, m.month_index),
                        ),
                      ),
                    });
                  }}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={disabled}
                  onClick={() => {
                    patch({ selectedMonthKeys: new Set() });
                  }}
                >
                  Clear all
                </Button>
              </div>
            </div>
            <div
              className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2"
              aria-labelledby={`${idPrefix}-months-covered-label`}
            >
              {selectableMonths.map((m) => {
                const key = monthKey(m.year, m.month_index);
                const checked = plan.selectedMonthKeys.has(key);
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors",
                      checked
                        ? "border-[var(--action,var(--data-green-strong,#2f6e58))] bg-[color-mix(in_srgb,var(--action,var(--data-green-strong,#2f6e58))_10%,transparent)] font-medium text-text-primary"
                        : "border-border-strong bg-surface hover:bg-surface-hover text-text-secondary",
                      disabled && "cursor-not-allowed opacity-70",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(v) => {
                        const next = new Set(plan.selectedMonthKeys);
                        if (v === true) next.add(key);
                        else next.delete(key);
                        patch({ selectedMonthKeys: next });
                      }}
                    />
                    <span>{m.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            This class has no start/end dates set yet. Add them on the course so
            you can pick which months this payment covers.
          </p>
        )
      ) : null}

      {plan.mode === DefaultStudentPaymentPlan.installment ? (
        scheduleLoading ? (
          <Skeleton className="h-24 w-full rounded-md" aria-busy="true" />
        ) : scheduleError ? (
          <p className="text-sm text-danger" role="alert">
            Could not load this class&apos;s schedule dates.
          </p>
        ) : selectableMonths.length > 0 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-installment-through-month`}>
                Paid through
              </Label>
              <Select
                placeholder="Select month"
                disabled={disabled}
                items={selectableMonths.map((m) => {
                  const key = monthKey(m.year, m.month_index);
                  return { label: m.label, value: key };
                })}
                value={plan.installmentThroughKey}
                onValueChange={(v) => {
                  if (v != null) {
                    patch({ installmentThroughKey: String(v) });
                  }
                }}
              />
              <p className="text-xs text-text-muted">
                Covers tuition through the selected month (inclusive).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Percent paid (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {INSTALLMENT_PERCENT_PRESETS.map((pct) => (
                  <Button
                    key={pct}
                    type="button"
                    variant={
                      !plan.customPercentMode &&
                      plan.installmentPercent === String(pct)
                        ? "primary"
                        : "secondary"
                    }
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      patch({
                        customPercentMode: false,
                        installmentPercent: String(pct),
                      });
                    }}
                  >
                    {pct}%
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={plan.customPercentMode ? "primary" : "secondary"}
                  size="sm"
                  disabled={disabled}
                  onClick={() => patch({ customPercentMode: true })}
                >
                  Custom
                </Button>
              </div>
              {plan.customPercentMode ? (
                <div className="relative">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    placeholder="Enter percent"
                    value={plan.installmentPercent}
                    disabled={disabled}
                    onChange={(e) =>
                      patch({ installmentPercent: e.target.value })
                    }
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                    %
                  </span>
                </div>
              ) : plan.installmentPercent ? (
                <p className="text-xs text-text-muted">
                  Selected: {plan.installmentPercent}%
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            This class has no start/end dates set yet.
          </p>
        )
      ) : null}

      {planError ? (
        <p
          className="text-sm text-danger"
          role="alert"
          data-field-name={planErrorFieldName}
        >
          {planError}
        </p>
      ) : null}
    </div>
  );
}
