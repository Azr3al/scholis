"use client";

import { searchEntities } from "@/app/client-api/utils";
import { Button, buttonVariants } from "@/components/primitives";
import { useCreateFlow } from "@/components/scheduling/create-flow-context";
import {
  getPrevIntakeStep,
  intakeStepPath,
  type IntakeFlowContext,
  type IntakeStepId,
} from "@/components/scheduling/intake/intake-steps";
import { formatDate, getDateISOString } from "@/helpers/date";
import { effectiveCourseDatesDifferFromIntake } from "@/helpers/intake-course-dates";
import { toLevelSectionNames } from "@/helpers/intake-sections";
import {
  getDefaultPaymentPlanId,
  getEffectivePaymentPlanId,
  getSubjectLabelsForRow,
  rowHasCustomPaymentPlan,
} from "@/helpers/intake-preview";
import {
  countIncludedCoursesWithNoSessions,
  formatRecurringSlotsDisplay,
  getEffectiveSlotsForRow,
} from "@/helpers/intake-schedule";
import { courseTypeFromSlots } from "@/components/scheduling/slots-simple-schedule-field";
import { operatorEnum } from "@/types/api";
import { axiosClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/primitives";
import type { IntakePreviewCourseRow } from "@/types/intake";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

function getDefaultCategoryId(
  state: ReturnType<typeof useCreateFlow>["state"],
): number | undefined {
  return state.defaultCategoryId ?? state.categoryId;
}

function getEffectiveCategoryId(
  rowKey: string,
  state: ReturnType<typeof useCreateFlow>["state"],
): number | undefined {
  if (state.categoryOverrides && rowKey in state.categoryOverrides) {
    return state.categoryOverrides[rowKey];
  }
  return getDefaultCategoryId(state);
}

function rowHasCustomDates(
  rowKey: string,
  state: ReturnType<typeof useCreateFlow>["state"],
  defaultStartIso?: string,
  defaultEndIso?: string,
): boolean {
  return effectiveCourseDatesDifferFromIntake(
    { start_date: defaultStartIso, end_date: defaultEndIso },
    { start_date: state.startDate, end_date: state.endDate },
    state.dateOverrides?.[rowKey],
  );
}

function rowHasCustomSlots(
  rowKey: string,
  state: ReturnType<typeof useCreateFlow>["state"],
): boolean {
  return Boolean(state.slotOverrides && rowKey in state.slotOverrides);
}

function rowHasCustomCategory(
  rowKey: string,
  state: ReturnType<typeof useCreateFlow>["state"],
): boolean {
  return Boolean(state.categoryOverrides && rowKey in state.categoryOverrides);
}

function rowIsCustom(
  rowKey: string,
  state: ReturnType<typeof useCreateFlow>["state"],
  defaultStartIso?: string,
  defaultEndIso?: string,
): boolean {
  return (
    rowHasCustomDates(rowKey, state, defaultStartIso, defaultEndIso) ||
    rowHasCustomSlots(rowKey, state) ||
    rowHasCustomCategory(rowKey, state) ||
    rowHasCustomPaymentPlan(rowKey, state.paymentPlanOverrides)
  );
}

function getRowStatusLabel(
  rowKey: string,
  state: ReturnType<typeof useCreateFlow>["state"],
  defaultStartIso?: string,
  defaultEndIso?: string,
): string {
  if (!rowIsCustom(rowKey, state, defaultStartIso, defaultEndIso)) {
    return "using default";
  }
  return "custom";
}

function getEffectiveRowDates(
  row: IntakePreviewCourseRow,
  state: ReturnType<typeof useCreateFlow>["state"],
  defaultStartIso?: string,
  defaultEndIso?: string,
): { start?: string; end?: string } {
  const override = state.dateOverrides?.[row.key];
  return {
    start: override?.start_date ?? defaultStartIso,
    end: override?.end_date ?? defaultEndIso,
  };
}

export function ConfirmStep({
  programId,
  stepId,
  flowContext,
}: {
  programId: string;
  stepId: IntakeStepId;
  flowContext: IntakeFlowContext;
}) {
  const router = useRouter();
  const toast = useToast();
  const { state, reset } = useCreateFlow();

  const previewRows = state.previewRows ?? [];
  const excluded = state.excluded ?? {};
  const titleEdits = state.titleEdits ?? {};
  const dateOverrides = state.dateOverrides ?? {};
  const slotOverrides = state.slotOverrides ?? {};
  const categoryOverrides = state.categoryOverrides ?? {};
  const paymentPlanOverrides = state.paymentPlanOverrides ?? {};
  const defaultSlots = state.defaultSlots ?? [];

  const defaultStartDate = state.defaultStartDate ?? state.startDate;
  const defaultEndDate = state.defaultEndDate ?? state.endDate;
  const defaultPaymentPlanId = getDefaultPaymentPlanId(
    state.paymentPlanId,
    state.defaultPaymentPlanId,
  );

  const includedRows = previewRows.filter((r) => excluded[r.key] !== true);
  const includedCount = includedRows.length;

  const noSessionsCount = countIncludedCoursesWithNoSessions(
    previewRows.map((r) => r.key),
    excluded,
    defaultSlots,
    slotOverrides,
  );

  const categoryIds = useMemo(() => {
    const ids = new Set<number>();
    const defaultCategoryId = getDefaultCategoryId(state);
    if (defaultCategoryId != null) ids.add(defaultCategoryId);
    for (const row of includedRows) {
      const id = getEffectiveCategoryId(row.key, state);
      if (id != null) ids.add(id);
    }
    return Array.from(ids);
  }, [includedRows, state]);

  const paymentPlanIds = useMemo(() => {
    const ids = new Set<number>();
    if (defaultPaymentPlanId != null) ids.add(defaultPaymentPlanId);
    for (const row of includedRows) {
      const id = getEffectivePaymentPlanId(
        row.key,
        defaultPaymentPlanId,
        paymentPlanOverrides,
      );
      if (id != null) ids.add(id);
    }
    return Array.from(ids);
  }, [defaultPaymentPlanId, includedRows, paymentPlanOverrides]);

  const { data: categoriesData } = useQuery({
    queryKey: ["confirm-categories", categoryIds],
    queryFn: () =>
      searchEntities(
        "categories",
        { fields: ["id", "name"], page: 1, size: Math.max(categoryIds.length, 1) },
        categoryIds.length > 0
          ? {
              filter_params: [
                {
                  field_name: "id",
                  operator: operatorEnum.in,
                  value: categoryIds.join(","),
                },
              ],
            }
          : undefined,
      ),
    enabled: categoryIds.length > 0,
  });

  const categoriesById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const c of (categoriesData?.data?.data ?? []) as {
      id: number;
      name: string;
    }[]) {
      map[c.id] = c.name;
    }
    return map;
  }, [categoriesData]);

  const { data: paymentPlansData } = useQuery({
    queryKey: ["confirm-payment-plans", paymentPlanIds],
    queryFn: () =>
      searchEntities(
        "payment-plans",
        { fields: ["id", "name"], page: 1, size: Math.max(paymentPlanIds.length, 1) },
        paymentPlanIds.length > 0
          ? {
              filter_params: [
                {
                  field_name: "id",
                  operator: operatorEnum.in,
                  value: paymentPlanIds.join(","),
                },
              ],
            }
          : undefined,
      ),
    enabled: paymentPlanIds.length > 0,
  });

  const paymentPlansById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const p of (paymentPlansData?.data?.data ?? []) as {
      id: number;
      name: string;
    }[]) {
      map[p.id] = p.name;
    }
    return map;
  }, [paymentPlansData]);

  const { data: subjectsData } = useQuery({
    queryKey: ["confirm-subjects"],
    queryFn: () =>
      searchEntities("subjects", { fields: ["id", "name"], sorts: ["name"], size: -1 }),
  });

  const subjectsById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const s of (subjectsData?.data?.data ?? []) as {
      id: number;
      name: string;
    }[]) {
      map[s.id] = s.name;
    }
    return map;
  }, [subjectsData]);

  const generate = useMutation({
    mutationFn: async () => {
      if (!state.intakeId) throw new Error("Missing intake");
      const levelSubjectIds: Record<string, number[]> = {};
      for (const [levelId, ids] of Object.entries(
        state.levelSubjectOverrides ?? {},
      )) {
        levelSubjectIds[levelId] = ids;
      }
      const defaultStartDate = state.defaultStartDate ?? state.startDate;
      const defaultEndDate = state.defaultEndDate ?? state.endDate;
      const defaultCategoryId = state.defaultCategoryId ?? state.categoryId;
      const defaultPaymentPlanId = getDefaultPaymentPlanId(
        state.paymentPlanId,
        state.defaultPaymentPlanId,
      );
      const levelSectionNames = toLevelSectionNames(state.levelSectionOverrides);
      const extraCourses = (state.extraCourses ?? []).map((row) => ({
        key: row.key,
        subject_id: row.subject_id,
        ...(row.title ? { title: row.title } : {}),
      }));
      return axiosClient.post(`intakes/${state.intakeId}/generate-courses`, {
        overrides: previewRows.map((row) => {
          const override: Record<string, unknown> = {
            key: row.key,
            included: excluded[row.key] !== true,
            title: titleEdits[row.key] ?? row.title,
          };
          if (row.key in dateOverrides) {
            override.start_date = dateOverrides[row.key]?.start_date;
            override.end_date = dateOverrides[row.key]?.end_date;
          }
          if (row.key in slotOverrides) {
            override.slots = slotOverrides[row.key];
          }
          if (row.key in categoryOverrides) {
            override.category_id = categoryOverrides[row.key];
          }
          if (row.key in paymentPlanOverrides) {
            override.payment_plan_id = paymentPlanOverrides[row.key];
          }
          return override;
        }),
        defaults: {
          category_id: defaultCategoryId,
          ...(defaultPaymentPlanId != null
            ? { payment_plan_id: defaultPaymentPlanId }
            : {}),
          ...(state.examSessionDate
            ? { exam_session_date: state.examSessionDate }
            : {}),
          ...(state.examBoard ? { exam_board: state.examBoard } : {}),
          start_date: defaultStartDate
            ? getDateISOString(new Date(defaultStartDate))
            : undefined,
          end_date: defaultEndDate
            ? getDateISOString(new Date(defaultEndDate))
            : undefined,
          level_subject_ids: levelSubjectIds,
          ...(levelSectionNames
            ? { level_section_names: levelSectionNames }
            : {}),
          ...(extraCourses.length > 0 ? { extra_courses: extraCourses } : {}),
          slots: state.defaultSlots ?? [],
          ...(() => {
            const courseType = courseTypeFromSlots(state.defaultSlots ?? []);
            return courseType ? { course_type: courseType } : {};
          })(),
        },
      });
    },
    onSuccess: () => {
      toast.add({ title: "Courses generated" });
      const intakeId = state.intakeId;
      reset();
      router.push(`/intakes/${intakeId}`);
    },
    onError: () => {
      toast.add({
        title: "Generation failed",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Confirm generation</h1>
        <p className="text-sm text-text-muted">
          Review <strong>{includedCount}</strong> courses for intake{" "}
          <strong>{state.intakeName}</strong> before generating.
        </p>
        {state.startDate && state.endDate ? (
          <p className="text-sm text-text-muted">
            Intake term: {formatDate(state.startDate)} –{" "}
            {formatDate(state.endDate)}.
          </p>
        ) : null}
      </div>

      {noSessionsCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <strong>{noSessionsCount}</strong> selected course
          {noSessionsCount === 1 ? "" : "s"}{" "}
          {noSessionsCount === 1 ? "has" : "have"} no recurring sessions
          configured.
          Courses can still be generated, but no class sessions will be created
          until sessions are added.
        </div>
      ) : null}

      {includedRows.length > 0 ? (
        <ul className="space-y-3">
          {includedRows.map((row) => {
            const title = titleEdits[row.key] ?? row.title;
            const { start, end } = getEffectiveRowDates(
              row,
              state,
              defaultStartDate,
              defaultEndDate,
            );
            const categoryId = getEffectiveCategoryId(row.key, state);
            const categoryLabel =
              categoryId != null
                ? categoriesById[categoryId] ?? `Category #${categoryId}`
                : "No category";
            const paymentPlanId = getEffectivePaymentPlanId(
              row.key,
              defaultPaymentPlanId,
              paymentPlanOverrides,
            );
            const paymentPlanLabel =
              paymentPlanId != null
                ? paymentPlansById[paymentPlanId] ??
                  `Payment plan #${paymentPlanId}`
                : "No payment plan";
            const slots = getEffectiveSlotsForRow(
              row.key,
              defaultSlots,
              slotOverrides,
            );
            const sessionSummary = formatRecurringSlotsDisplay(slots);
            const statusLabel = getRowStatusLabel(
              row.key,
              state,
              defaultStartDate,
              defaultEndDate,
            );
            const isCustom = rowIsCustom(
              row.key,
              state,
              defaultStartDate,
              defaultEndDate,
            );
            const subjectLabels = getSubjectLabelsForRow(
              row,
              subjectsById,
              state.levelSubjectOverrides,
            );

            return (
              <li
                key={row.key}
                className="rounded-lg border bg-surface-hover/10 p-4 space-y-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-medium">{title}</h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {subjectLabels.map((label) => (
                      <span
                        key={`${row.key}-${label}`}
                        className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary"
                      >
                        {label}
                      </span>
                    ))}
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs", isCustom ? "bg-primary text-primary-foreground" : "bg-surface-hover text-text-secondary")}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
                <dl className="grid gap-1 text-sm text-text-muted sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium text-text-primary">Dates: </dt>
                    <dd className="inline">
                      {start && end
                        ? `${formatDate(start)} – ${formatDate(end)}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-text-primary">Category: </dt>
                    <dd className="inline">{categoryLabel}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-text-primary">
                      Payment plan:{" "}
                    </dt>
                    <dd className="inline">{paymentPlanLabel}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="inline font-medium text-text-primary">Sessions: </dt>
                    <dd className="inline">{sessionSummary}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">No courses selected.</p>
      )}

      <div className="flex justify-between">
        <Link
          href={intakeStepPath(
            programId,
            getPrevIntakeStep(stepId, flowContext)!,
          )}
          className={cn(buttonVariants({ variant: "secondary" }))}
        >
          Back
        </Link>
        <Button
          type="button"
          isLoading={generate.isLoading}
          disabled={includedCount === 0}
          onClick={() => generate.mutate()}
        >
          Generate courses
        </Button>
      </div>
    </div>
  );
}
