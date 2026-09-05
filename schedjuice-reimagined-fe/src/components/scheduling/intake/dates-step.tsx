"use client";

import { CourseCategoryField } from "@/components/course/course-category-field";
import EntityCombobox from "@/components/form/entity-combobox";
import { DatePicker } from "@/components/date/date-picker";
import { Button, buttonVariants } from "@/components/primitives";
import { Input } from "@/components/primitives";
import { Field } from "@/components/primitives";
import { useCreateFlow } from "@/components/scheduling/create-flow-context";
import {
  IntakeExamDefaultsFields,
  intakeExamDefaultsComplete,
  type IntakeExamDefaults,
} from "@/components/scheduling/intake-add-exam-fields";
import {
  getNextIntakeStep,
  getPrevIntakeStep,
  intakeStepPath,
  type IntakeFlowContext,
  type IntakeStepId,
} from "@/components/scheduling/intake/intake-steps";
import { getDateISOString } from "@/helpers/date";
import { shouldWarnLongCourseDuration } from "@/helpers/course-duration-warning";
import { LongCourseDurationWarning } from "@/components/course/long-course-duration-warning";
import { usePaymentPlanOptionLabel } from "@/hooks/usePaymentPlanOptionLabel";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function parseStoredDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function DatesStep({
  programId,
  stepId,
  flowContext,
}: {
  programId: string;
  stepId: IntakeStepId;
  flowContext: IntakeFlowContext;
}) {
  const router = useRouter();
  const { tenant } = useTenant();
  const paymentPlanOptionLabel = usePaymentPlanOptionLabel();
  const { state, setState, clearIntakePreviewState } = useCreateFlow();
  const examFieldsEnabled = Boolean(tenant?.is_exam_board_in_course_enabled);
  const [name, setName] = useState(state.intakeName ?? "");
  const [startDate, setStartDate] = useState<Date | undefined>(() =>
    parseStoredDate(state.startDate),
  );
  const [endDate, setEndDate] = useState<Date | undefined>(() =>
    parseStoredDate(state.endDate),
  );
  const [categoryId, setCategoryId] = useState(
    state.categoryId ? String(state.categoryId) : "",
  );
  const [paymentPlanId, setPaymentPlanId] = useState(
    state.paymentPlanId ? String(state.paymentPlanId) : "",
  );
  const [examDefaults, setExamDefaults] = useState<IntakeExamDefaults>({
    examSessionDate: state.examSessionDate ?? null,
    examBoard: state.examBoard ?? null,
  });

  const canContinue =
    name.trim().length > 0 &&
    startDate != null &&
    endDate != null &&
    startDate <= endDate &&
    (!examFieldsEnabled || intakeExamDefaultsComplete(examDefaults));
  const showLongCourseDurationWarning = shouldWarnLongCourseDuration(
    tenant,
    startDate,
    endDate,
  );

  function handleContinue() {
    if (!canContinue || !startDate || !endDate) return;
    clearIntakePreviewState();
    setState({
      intakeName: name.trim(),
      startDate: getDateISOString(startDate),
      endDate: getDateISOString(endDate),
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
      paymentPlanId: paymentPlanId ? parseInt(paymentPlanId, 10) : undefined,
      examSessionDate: examDefaults.examSessionDate ?? undefined,
      examBoard: examDefaults.examBoard ?? undefined,
    });
    router.push(
      intakeStepPath(
        programId,
        getNextIntakeStep(stepId, flowContext)!,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Intake dates</h1>
        <p className="text-sm text-text-muted">
          Name this intake and set the term date range for this cohort.
        </p>
      </div>
      <div className="space-y-4 max-w-lg">
        <Field.Root className="w-full">
          <Field.Label>Intake name</Field.Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Term 1 2026"
          />
        </Field.Root>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field.Root className="w-full">
            <Field.Label>Start date</Field.Label>
            <DatePicker
              date={startDate}
              toDate={endDate}
              setDate={(date) => {
                setStartDate(date);
                if (date && endDate && endDate < date) {
                  setEndDate(undefined);
                }
              }}
            />
          </Field.Root>
          <Field.Root className="w-full">
            <Field.Label>End date</Field.Label>
            <DatePicker
              date={endDate}
              fromDate={startDate}
              setDate={setEndDate}
            />
          </Field.Root>
        </div>
        {startDate && endDate && startDate > endDate && (
          <p className="text-sm text-destructive">
            End date must be on or after the start date.
          </p>
        )}
        {showLongCourseDurationWarning ? <LongCourseDurationWarning /> : null}
        <CourseCategoryField
          value={categoryId ? Number(categoryId) : null}
          onChange={(v) => setCategoryId(v != null && v > 0 ? String(v) : "")}
          label="Default category for generated courses"
          placeholder="Select category"
        />
        <EntityCombobox
          entity="payment-plans"
          displayFunction={paymentPlanOptionLabel}
          value={paymentPlanId}
          onChange={setPaymentPlanId}
          label="Default payment plan for generated courses · optional"
          emptyOption={{ value: "", label: "None" }}
          comboboxPlaceholder="None"
        />
        {examFieldsEnabled ? (
          <IntakeExamDefaultsFields
            value={examDefaults}
            onChange={setExamDefaults}
            required
          />
        ) : null}
      </div>
      <div className="flex justify-between">
        {getPrevIntakeStep(stepId, flowContext) ? (
          <Link
            href={intakeStepPath(
              programId,
              getPrevIntakeStep(stepId, flowContext)!,
            )}
            className={cn(buttonVariants({ variant: "secondary" }))}
          >
            Back
          </Link>
        ) : (
          <span />
        )}
        <Button type="button" disabled={!canContinue} onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
