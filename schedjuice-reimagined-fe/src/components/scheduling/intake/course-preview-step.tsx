"use client";

import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import { CourseCategoryField } from "@/components/course/course-category-field";
import EntityCombobox from "@/components/form/entity-combobox";
import { DatePicker } from "@/components/date/date-picker";
import { buttonVariants } from "@/components/primitives";
import { Button } from "@/components/primitives";
import { Checkbox } from "@/components/primitives";
import { Select } from "@/components/primitives";
import { Input } from "@/components/primitives";
import { Field } from "@/components/primitives";
import {
  buildPreviewSignature,
  shouldSkipPreviewFetch,
  useCreateFlow,
} from "@/components/scheduling/create-flow-context";
import {
  getNextIntakeStep,
  getPrevIntakeStep,
  intakeStepPath,
  type IntakeFlowContext,
  type IntakeStepId,
} from "@/components/scheduling/intake/intake-steps";
import { recurringSlotsEditorValid } from "@/components/scheduling/intake/recurring-slots-editor";
import { SlotsSimpleScheduleField } from "@/components/scheduling/slots-simple-schedule-field";
import { SubjectStrategy } from "@/types/program";
import {
  getDefaultPaymentPlanId,
  getEffectivePaymentPlanId,
  getSubjectLabelsForRow,
  groupPreviewRows,
  rowHasCustomPaymentPlan,
} from "@/helpers/intake-preview";
import { formatDate, getDateISOString } from "@/helpers/date";
import { shouldWarnLongCourseDuration } from "@/helpers/course-duration-warning";
import {
  effectiveCourseDatesDifferFromIntake,
} from "@/helpers/intake-course-dates";
import { LongCourseDurationWarning } from "@/components/course/long-course-duration-warning";
import { usePaymentPlanOptionLabel } from "@/hooks/usePaymentPlanOptionLabel";
import { useTenant } from "@/hooks/useTenant";
import { toLevelSectionNames } from "@/helpers/intake-sections";
import {
  countIncludedCoursesWithNoSessions,
  formatRecurringSlotsSummary,
  getEffectiveSlotsForRow,
} from "@/helpers/intake-schedule";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { axiosClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { operatorEnum } from "@/types/api";
import type { IntakePreviewCourseRow, RecurringSlot } from "@/types/intake";
import { useQuery } from "@tanstack/react-query";
import { NavArrowDown as ChevronDown, OpenNewWindow as ExternalLink, EditPencil as Pencil, Plus, Trash as Trash2 } from "iconoir-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function parseStoredDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function getDefaultStartDate(state: ReturnType<typeof useCreateFlow>["state"]) {
  return state.defaultStartDate ?? state.startDate;
}

function getDefaultEndDate(state: ReturnType<typeof useCreateFlow>["state"]) {
  return state.defaultEndDate ?? state.endDate;
}

function getEffectiveSlots(
  rowKey: string,
  state: ReturnType<typeof useCreateFlow>["state"],
): RecurringSlot[] {
  return getEffectiveSlotsForRow(
    rowKey,
    state.defaultSlots ?? [],
    state.slotOverrides,
  );
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

function rowHasCustomCategory(
  rowKey: string,
  state: ReturnType<typeof useCreateFlow>["state"],
): boolean {
  return Boolean(state.categoryOverrides && rowKey in state.categoryOverrides);
}

function getDefaultPaymentPlanIdFromState(
  state: ReturnType<typeof useCreateFlow>["state"],
): number | undefined {
  return getDefaultPaymentPlanId(state.paymentPlanId, state.defaultPaymentPlanId);
}

function getEffectivePaymentPlanIdFromState(
  rowKey: string,
  state: ReturnType<typeof useCreateFlow>["state"],
): number | undefined {
  return getEffectivePaymentPlanId(
    rowKey,
    getDefaultPaymentPlanIdFromState(state),
    state.paymentPlanOverrides,
  );
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
  const customDates = rowHasCustomDates(
    rowKey,
    state,
    defaultStartIso,
    defaultEndIso,
  );
  const customSlots = rowHasCustomSlots(rowKey, state);
  const customCategory = rowHasCustomCategory(rowKey, state);
  const customPaymentPlan = rowHasCustomPaymentPlan(
    rowKey,
    state.paymentPlanOverrides,
  );
  if (!customDates && !customSlots && !customCategory && !customPaymentPlan) {
    return "using default";
  }
  const slots = getEffectiveSlots(rowKey, state);
  const slotSummary = formatRecurringSlotsSummary(slots);
  const parts: string[] = ["custom"];
  if (customDates) parts.push("course dates");
  if (customCategory) parts.push("category");
  if (customPaymentPlan) parts.push("payment plan");
  if (slotSummary) parts.push(slotSummary);
  return parts.join(" · ");
}

export function CoursePreviewStep({
  programId,
  stepId,
  flowContext,
}: {
  programId: string;
  stepId: IntakeStepId;
  flowContext: IntakeFlowContext;
}) {
  const { state, setState } = useCreateFlow();
  const { tenant } = useTenant();
  const paymentPlanOptionLabel = usePaymentPlanOptionLabel();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [addSubjectId, setAddSubjectId] = useState<string>("");
  const [defaultOvernightConfirmed, setDefaultOvernightConfirmed] = useState<
    Record<number, boolean>
  >({});
  const [rowOvernightConfirmed, setRowOvernightConfirmed] = useState<
    Record<string, Record<number, boolean>>
  >({});

  const previewRows = state.previewRows ?? [];
  const extraCourses = state.extraCourses ?? [];
  const excluded = state.excluded ?? {};
  const titleEdits = state.titleEdits ?? {};
  const defaultSlots = state.defaultSlots ?? [];
  const dateOverrides = state.dateOverrides ?? {};
  const slotOverrides = state.slotOverrides ?? {};
  const categoryOverrides = state.categoryOverrides ?? {};
  const paymentPlanOverrides = state.paymentPlanOverrides ?? {};

  const defaultStartIso = getDefaultStartDate(state);
  const defaultEndIso = getDefaultEndDate(state);
  const defaultCategoryId = getDefaultCategoryId(state);
  const defaultPaymentPlanId = getDefaultPaymentPlanIdFromState(state);

  useEffect(() => {
    if (!state.startDate || !state.endDate) return;
    const patch: Partial<typeof state> = {};
    if (!state.defaultStartDate) patch.defaultStartDate = state.startDate;
    if (!state.defaultEndDate) patch.defaultEndDate = state.endDate;
    if (Object.keys(patch).length > 0) setState(patch);
  }, [
    setState,
    state.defaultEndDate,
    state.defaultStartDate,
    state.endDate,
    state.startDate,
  ]);

  useEffect(() => {
    if (state.categoryId != null && state.defaultCategoryId == null) {
      setState({ defaultCategoryId: state.categoryId });
    }
  }, [setState, state.categoryId, state.defaultCategoryId]);

  useEffect(() => {
    if (state.paymentPlanId != null && state.defaultPaymentPlanId == null) {
      setState({ defaultPaymentPlanId: state.paymentPlanId });
    }
  }, [setState, state.paymentPlanId, state.defaultPaymentPlanId]);

  async function findExistingIntakeId(): Promise<number | undefined> {
    if (!state.intakeName) return undefined;
    const res = await searchEntities(
      "intakes",
      { fields: ["id"], page: 1, size: 1 },
      {
        filter_params: [
          {
            field_name: "program",
            operator: operatorEnum.exact,
            value: programId,
          },
          {
            field_name: "name",
            operator: operatorEnum.exact,
            value: state.intakeName,
          },
        ],
      },
    );
    const row = (res?.data?.data ?? [])[0] as { id?: number } | undefined;
    return row?.id;
  }

  async function resolveIntakeId(ignoreCachedId = false): Promise<number> {
    if (!ignoreCachedId && state.intakeId) return state.intakeId;

    const existingId = await findExistingIntakeId();
    if (existingId != null) return existingId;

    try {
      const res = await makePostRequest("intakes", {
        name: state.intakeName,
        program: parseInt(programId, 10),
        start_date: getDateISOString(new Date(state.startDate!)),
        end_date: getDateISOString(new Date(state.endDate!)),
      });
      const createdId = res.data?.data?.id ?? res.data?.id;
      if (createdId == null) {
        throw new Error("Intake was created but no id was returned.");
      }
      return createdId;
    } catch (err) {
      const retryId = await findExistingIntakeId();
      if (retryId != null) return retryId;
      throw err;
    }
  }

  useEffect(() => {
    if (!state.intakeName || !state.startDate || !state.endDate) return;

    const signature = buildPreviewSignature(
      programId,
      state.intakeName,
      state.startDate,
      state.endDate,
      state.levelSubjectOverrides,
      state.levelSectionOverrides,
      state.extraCourses,
    );
    if (shouldSkipPreviewFetch(state, signature, previewRows.length)) return;

    const ignoreCachedIntakeId = state.previewSignature !== signature;
    const levelSectionNames = toLevelSectionNames(state.levelSectionOverrides);

    let cancelled = false;
    async function createAndPreview() {
      setLoading(true);
      setError(null);
      try {
        const intakeId = await resolveIntakeId(ignoreCachedIntakeId);
        const previewDefaults: Record<string, unknown> = {};
        if (levelSectionNames) {
          previewDefaults.level_section_names = levelSectionNames;
        }
        if (extraCourses.length > 0) {
          previewDefaults.extra_courses = extraCourses.map((row) => ({
            key: row.key,
            subject_id: row.subject_id,
            ...(row.title ? { title: row.title } : {}),
          }));
        }
        const previewRes = await axiosClient.post(
          `intakes/${intakeId}/preview-courses`,
          {
            defaults: previewDefaults,
          },
        );
        const rows = (previewRes.data?.courses ?? []) as IntakePreviewCourseRow[];
        if (!cancelled) {
          setState({ previewRows: rows, intakeId, previewSignature: signature });
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            parseSchedjuiceApiError(err, "Could not load course preview."),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void createAndPreview();
  }, [
    programId,
    previewRows.length,
    setState,
    state.endDate,
    state.extraCourses,
    state.intakeId,
    state.intakeName,
    state.levelSubjectOverrides,
    state.levelSectionOverrides,
    state.previewSignature,
    state.startDate,
  ]);

  const { data: levelsData } = useQuery({
    queryKey: ["preview-levels", programId],
    queryFn: () =>
      searchEntities(
        "program-levels",
        {},
        {
          filter_params: [
            { field_name: "program", operator: operatorEnum.exact, value: programId },
          ],
        },
      ),
  });

  const levelsById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const l of (levelsData?.data?.data ?? []) as { id: number; name: string }[]) {
      map[l.id] = l.name;
    }
    return map;
  }, [levelsData]);

  const { data: subjectsData } = useQuery({
    queryKey: ["preview-subjects"],
    queryFn: () =>
      searchEntities("subjects", { fields: ["id", "name"], sorts: ["name"], size: -1 }),
  });

  const subjectsById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const s of (subjectsData?.data?.data ?? []) as { id: number; name: string }[]) {
      map[s.id] = s.name;
    }
    return map;
  }, [subjectsData]);

  const subjectLabelsByLevel = useMemo(() => {
    const map: Record<number, string[]> = {};
    for (const [levelId, ids] of Object.entries(
      state.levelSubjectOverrides ?? {},
    )) {
      map[Number(levelId)] = ids.map((id) => subjectsById[id] ?? `#${id}`);
    }
    return map;
  }, [state.levelSubjectOverrides, subjectsById]);

  const { data: programSubjectsData } = useQuery({
    queryKey: ["preview-program-subjects", programId],
    queryFn: () =>
      searchEntities(
        "program-subjects",
        {
          expand: ["subject"],
          size: -1,
          sorts: ["sort_order", "id"],
        },
        {
          filter_params: [
            {
              field_name: "program",
              operator: operatorEnum.exact,
              value: programId,
            },
            {
              field_name: "is_active",
              operator: operatorEnum.exact,
              value: "True",
            },
          ],
        },
      ),
    enabled: flowContext.subjectStrategy === SubjectStrategy.required,
  });

  const programSubjectOptions = useMemo(() => {
    const rows = (programSubjectsData?.data?.data ?? []) as Array<{
      subject: number | { id: number; name: string };
      is_active?: boolean;
    }>;
    return rows
      .filter((row) => row.is_active !== false)
      .map((row) => {
        const subjectId =
          typeof row.subject === "object" ? row.subject.id : row.subject;
        const name =
          typeof row.subject === "object" ? row.subject.name : `#${row.subject}`;
        return { value: String(subjectId), label: name };
      })
      .filter(
        (opt, index, all) =>
          all.findIndex((candidate) => candidate.value === opt.value) === index,
      );
  }, [programSubjectsData]);

  const groups = groupPreviewRows(previewRows, levelsById, subjectLabelsByLevel);

  const includedCount = previewRows.filter(
    (r) => excluded[r.key] !== true,
  ).length;

  const noSessionsCount = countIncludedCoursesWithNoSessions(
    previewRows.map((r) => r.key),
    excluded,
    defaultSlots,
    slotOverrides,
  );

  const defaultStartDate = parseStoredDate(defaultStartIso);
  const defaultEndDate = parseStoredDate(defaultEndIso);
  const defaultDatesValid =
    defaultStartDate != null &&
    defaultEndDate != null &&
    defaultStartDate <= defaultEndDate;
  const showDefaultLongCourseDurationWarning = shouldWarnLongCourseDuration(
    tenant,
    defaultStartDate,
    defaultEndDate,
  );

  const defaultScheduleValid =
    defaultDatesValid &&
    recurringSlotsEditorValid(defaultSlots, {
      overnightConfirmedByIndex: defaultOvernightConfirmed,
    });

  const rowOverridesValid = previewRows.every((row) => {
    if (excluded[row.key] === true) return true;
    const rowDates = dateOverrides[row.key];
    if (rowDates) {
      const start = parseStoredDate(
        rowDates.start_date ?? defaultStartIso,
      );
      const end = parseStoredDate(rowDates.end_date ?? defaultEndIso);
      if (!start || !end || start > end) return false;
    }
    const slots = getEffectiveSlots(row.key, state);
    return recurringSlotsEditorValid(slots, {
      overnightConfirmedByIndex: rowOvernightConfirmed[row.key] ?? {},
    });
  });

  function toggleRow(key: string, checked: boolean) {
    const next = { ...excluded };
    if (checked) delete next[key];
    else next[key] = true;
    setState({ excluded: next });
  }

  function setTitle(key: string, title: string) {
    setState({
      titleEdits: { ...titleEdits, [key]: title },
    });
  }

  function setDefaultStartDate(date: Date | undefined) {
    if (!date) return;
    setState({ defaultStartDate: getDateISOString(date) });
  }

  function setDefaultEndDate(date: Date | undefined) {
    if (!date) return;
    setState({ defaultEndDate: getDateISOString(date) });
  }

  function setDefaultSlots(slots: RecurringSlot[]) {
    setDefaultOvernightConfirmed({});
    setState({ defaultSlots: slots });
  }

  function setDefaultCategory(categoryId: string) {
    setState({
      defaultCategoryId: categoryId ? parseInt(categoryId, 10) : undefined,
    });
  }

  function setDefaultPaymentPlan(paymentPlanId: string) {
    setState({
      defaultPaymentPlanId: paymentPlanId
        ? parseInt(paymentPlanId, 10)
        : undefined,
    });
  }

  function clearAllOverrides() {
    setState({
      dateOverrides: {},
      slotOverrides: {},
      categoryOverrides: {},
      paymentPlanOverrides: {},
    });
  }

  function setRowStartDate(rowKey: string, date: Date | undefined) {
    if (!date) return;
    setState({
      dateOverrides: {
        ...dateOverrides,
        [rowKey]: {
          ...dateOverrides[rowKey],
          start_date: getDateISOString(date),
        },
      },
    });
  }

  function setRowEndDate(rowKey: string, date: Date | undefined) {
    if (!date) return;
    setState({
      dateOverrides: {
        ...dateOverrides,
        [rowKey]: {
          ...dateOverrides[rowKey],
          end_date: getDateISOString(date),
        },
      },
    });
  }

  function resetRowDates(rowKey: string) {
    const next = { ...dateOverrides };
    delete next[rowKey];
    setState({ dateOverrides: next });
  }

  function resetRowToIntakeDates(rowKey: string) {
    if (!state.startDate || !state.endDate) return;
    setState({
      dateOverrides: {
        ...dateOverrides,
        [rowKey]: {
          start_date: state.startDate,
          end_date: state.endDate,
        },
      },
    });
  }

  function setRowSlots(rowKey: string, slots: RecurringSlot[]) {
    setRowOvernightConfirmed((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
    setState({
      slotOverrides: {
        ...slotOverrides,
        [rowKey]: slots,
      },
    });
  }

  function resetRowSlots(rowKey: string) {
    const next = { ...slotOverrides };
    delete next[rowKey];
    setState({ slotOverrides: next });
  }

  function setRowCategory(rowKey: string, categoryId: string) {
    if (!categoryId) return;
    setState({
      categoryOverrides: {
        ...categoryOverrides,
        [rowKey]: parseInt(categoryId, 10),
      },
    });
  }

  function resetRowCategory(rowKey: string) {
    const next = { ...categoryOverrides };
    delete next[rowKey];
    setState({ categoryOverrides: next });
  }

  function setRowPaymentPlan(rowKey: string, paymentPlanId: string) {
    if (!paymentPlanId) {
      resetRowPaymentPlan(rowKey);
      return;
    }
    setState({
      paymentPlanOverrides: {
        ...paymentPlanOverrides,
        [rowKey]: parseInt(paymentPlanId, 10),
      },
    });
  }

  function resetRowPaymentPlan(rowKey: string) {
    const next = { ...paymentPlanOverrides };
    delete next[rowKey];
    setState({ paymentPlanOverrides: next });
  }

  function resetRowOverrides(rowKey: string) {
    const nextDates = { ...dateOverrides };
    const nextSlots = { ...slotOverrides };
    const nextCategories = { ...categoryOverrides };
    const nextPaymentPlans = { ...paymentPlanOverrides };
    delete nextDates[rowKey];
    delete nextSlots[rowKey];
    delete nextCategories[rowKey];
    delete nextPaymentPlans[rowKey];
    setState({
      dateOverrides: nextDates,
      slotOverrides: nextSlots,
      categoryOverrides: nextCategories,
      paymentPlanOverrides: nextPaymentPlans,
    });
  }

  function addExtraCourse() {
    if (!addSubjectId) return;
    const subjectId = parseInt(addSubjectId, 10);
    if (Number.isNaN(subjectId)) return;
    const key = `extra:${crypto.randomUUID()}`;
    setState({
      extraCourses: [...extraCourses, { key, subject_id: subjectId }],
      previewSignature: undefined,
    });
    setAddSubjectId("");
  }

  function removeExtraCourse(key: string) {
    const nextExtraCourses = extraCourses.filter((row) => row.key !== key);
    const nextTitleEdits = { ...titleEdits };
    const nextExcluded = { ...excluded };
    delete nextTitleEdits[key];
    delete nextExcluded[key];
    setState({
      extraCourses: nextExtraCourses,
      titleEdits: nextTitleEdits,
      excluded: nextExcluded,
      previewSignature: undefined,
    });
  }

  const reviewDisabled =
    loading ||
    includedCount === 0 ||
    !defaultScheduleValid ||
    !rowOverridesValid;

  const reviewHref = intakeStepPath(
    programId,
    getNextIntakeStep(stepId, flowContext)!,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Courses to create</h1>
          <p className="text-sm text-text-muted">
            {loading
              ? "Loading preview…"
              : `${includedCount} of ${previewRows.length} courses selected`}
          </p>
        </div>
        <Link
          href={`/programs/${programId}/settings`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "gap-1.5")}
        >
          Edit subjects
          <ExternalLink className="size-3.5" />
        </Link>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {flowContext.subjectStrategy === SubjectStrategy.required ? (
        <div className="rounded-lg border bg-surface-hover/10 p-4 space-y-3">
          <div>
            <h2 className="text-base font-semibold">Add another course</h2>
            <p className="text-sm text-text-muted">
              Add an extra exam-prep course for this intake without changing the
              program catalog.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field.Root className="min-w-[220px] flex-1">
              <Field.Label>Subject</Field.Label>
              <Select
                items={programSubjectOptions}
                value={addSubjectId}
                onValueChange={(value) => setAddSubjectId(value as string)}
                placeholder="Select subject"
                className="w-full"
              />
            </Field.Root>
            <Button
              type="button"
              variant="secondary"
              disabled={!addSubjectId}
              onClick={addExtraCourse}
            >
              <Plus className="mr-2 size-4" />
              Add course
            </Button>
          </div>
        </div>
      ) : null}

      {previewRows.length > 0 ? (
        <div className="rounded-lg border bg-surface-hover/20 p-4 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Course run dates (default)</h2>
            <p className="text-sm text-text-muted">
              Applied to all courses unless overridden below. Defaults to the
              intake term unless you change them.
            </p>
            {state.startDate && state.endDate ? (
              <p className="text-xs text-text-muted mt-1">
                Intake term: {formatDate(state.startDate)} –{" "}
                {formatDate(state.endDate)}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field.Root className="w-full">
              <Field.Label>Course start date</Field.Label>
              <DatePicker
                date={defaultStartDate}
                toDate={defaultEndDate}
                setDate={setDefaultStartDate}
              />
            </Field.Root>
            <Field.Root className="w-full">
              <Field.Label>Course end date</Field.Label>
              <DatePicker
                date={defaultEndDate}
                fromDate={defaultStartDate}
                setDate={setDefaultEndDate}
              />
            </Field.Root>
          </div>
          {!defaultDatesValid ? (
            <p className="text-sm text-destructive">
              Default end date must be on or after the start date.
            </p>
          ) : null}
          {showDefaultLongCourseDurationWarning ? (
            <LongCourseDurationWarning />
          ) : null}
          <CourseCategoryField
            value={defaultCategoryId != null ? defaultCategoryId : null}
            onChange={(v) =>
              setDefaultCategory(v != null && v > 0 ? String(v) : "")
            }
            label="Default category"
            placeholder="Select category"
          />
          <EntityCombobox
            entity="payment-plans"
            displayFunction={paymentPlanOptionLabel}
            value={
              defaultPaymentPlanId != null ? String(defaultPaymentPlanId) : ""
            }
            onChange={setDefaultPaymentPlan}
            label="Default payment plan · optional"
            emptyOption={{ value: "", label: "None" }}
            comboboxPlaceholder="None"
          />
          <SlotsSimpleScheduleField
            idPrefix="default"
            slots={defaultSlots}
            onChange={setDefaultSlots}
            overnightConfirmedByIndex={defaultOvernightConfirmed}
            onOvernightConfirmedByIndexChange={setDefaultOvernightConfirmed}
          />
          {noSessionsCount > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              No sessions configured yet for{" "}
              <strong>{noSessionsCount}</strong> selected course
              {noSessionsCount === 1 ? "" : "s"}. Courses can still be
              created, but no recurring class sessions will be generated until
              sessions are added.
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={clearAllOverrides}>
              Apply default to all
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearAllOverrides}>
              Reset all overrides
            </Button>
          </div>
        </div>
      ) : null}

      {previewRows.length === 0 && !loading ? (
        <p className="text-sm text-text-muted">
          {flowContext.subjectStrategy === SubjectStrategy.required
            ? "No subjects configured. Add subjects in the previous step or in program settings."
            : "No courses to generate. Check program subjects or levels in settings."}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.levelId ?? "flat"} className="rounded-lg border">
              {group.levelName ? (
                <div className="border-b bg-surface-hover/40 px-4 py-2 text-sm">
                  <span className="font-medium">{group.levelName}</span>
                  {group.subjectLabels && group.subjectLabels.length > 0 ? (
                    <span className="ml-2 text-text-muted">
                      — {group.subjectLabels.join(" · ")}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <ul className="divide-y">
                {group.rows.map((row) => {
                  const isOpen = openRows[row.key] ?? false;
                  const rowDateOverride = dateOverrides[row.key];
                  const rowStartDate = parseStoredDate(
                    rowDateOverride?.start_date ?? defaultStartIso,
                  );
                  const rowEndDate = parseStoredDate(
                    rowDateOverride?.end_date ?? defaultEndIso,
                  );
                  const rowSlots = getEffectiveSlots(row.key, state);
                  const rowCategoryId = getEffectiveCategoryId(row.key, state);
                  const statusLabel = getRowStatusLabel(
                    row.key,
                    state,
                    defaultStartIso,
                    defaultEndIso,
                  );
                  const isCustom = rowIsCustom(
                    row.key,
                    state,
                    defaultStartIso,
                    defaultEndIso,
                  );
                  const subjectLabels = getSubjectLabelsForRow(
                    row,
                    subjectsById,
                    state.levelSubjectOverrides,
                  );
                  const rowPaymentPlanId = getEffectivePaymentPlanIdFromState(
                    row.key,
                    state,
                  );

                  return (
                    <li key={row.key}>
                        <div className="flex items-start gap-3 p-3">
                          <Checkbox
                            className="mt-2"
                            checked={excluded[row.key] !== true}
                            onCheckedChange={(v) => toggleRow(row.key, v === true)}
                          />
                          <div className="min-w-0 flex-1 space-y-2">
                            <Field.Root className="w-full">
                              <Field.Label className="text-xs text-text-muted">
                                Course title
                              </Field.Label>
                              <div className="relative w-full">
                                <Pencil
                                  aria-hidden
                                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                                />
                                <Input
                                  className="h-10 w-full bg-surface pl-9 text-base font-medium shadow-sm transition-colors hover:border-primary/40 focus-visible:border-primary"
                                  placeholder="Enter course title"
                                  value={titleEdits[row.key] ?? row.title}
                                  onChange={(e) => setTitle(row.key, e.target.value)}
                                />
                              </div>
                            </Field.Root>
                            <div className="flex items-center justify-between gap-2">
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
                                {row.is_extra ? (
                                  <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
                                    Extra
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-1">
                                {row.is_extra ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-label="Remove extra course"
                                    onClick={() => removeExtraCourse(row.key)}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  aria-label="Toggle course details"
                                  aria-expanded={isOpen}
                                  onClick={() =>
                                    setOpenRows((prev) => ({
                                      ...prev,
                                      [row.key]: !isOpen,
                                    }))
                                  }
                                >
                                  <ChevronDown
                                    className={cn(
                                      "size-4 transition-transform",
                                      isOpen && "rotate-180",
                                    )}
                                  />
                                </Button>
                              </div>
                            </div>
                            {isOpen ? (
                            <div className="space-y-4 rounded-md border bg-surface-hover/10 p-4">
                              {state.startDate && state.endDate ? (
                                <p className="text-xs text-text-muted">
                                  Intake term: {formatDate(state.startDate)} –{" "}
                                  {formatDate(state.endDate)}
                                </p>
                              ) : null}
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field.Root className="w-full">
                                  <Field.Label>Course start date</Field.Label>
                                  <DatePicker
                                    date={rowStartDate}
                                    toDate={rowEndDate}
                                    setDate={(date) =>
                                      setRowStartDate(row.key, date)
                                    }
                                  />
                                </Field.Root>
                                <Field.Root className="w-full">
                                  <Field.Label>Course end date</Field.Label>
                                  <DatePicker
                                    date={rowEndDate}
                                    fromDate={rowStartDate}
                                    setDate={(date) =>
                                      setRowEndDate(row.key, date)
                                    }
                                  />
                                </Field.Root>
                              </div>
                              {rowStartDate && rowEndDate && rowStartDate > rowEndDate ? (
                                <p className="text-sm text-destructive">
                                  End date must be on or after the start date.
                                </p>
                              ) : null}
                              {shouldWarnLongCourseDuration(
                                tenant,
                                rowStartDate,
                                rowEndDate,
                              ) ? (
                                <LongCourseDurationWarning />
                              ) : null}
                              <CourseCategoryField
                                value={rowCategoryId != null ? rowCategoryId : null}
                                onChange={(v) =>
                                  setRowCategory(
                                    row.key,
                                    v != null && v > 0 ? String(v) : "",
                                  )
                                }
                                label="Category"
                                placeholder="Select category"
                              />
                              <EntityCombobox
                                entity="payment-plans"
                                displayFunction={paymentPlanOptionLabel}
                                value={
                                  rowPaymentPlanId != null
                                    ? String(rowPaymentPlanId)
                                    : ""
                                }
                                onChange={(value) =>
                                  setRowPaymentPlan(row.key, value)
                                }
                                label="Payment plan · optional"
                                emptyOption={{ value: "", label: "None" }}
                                comboboxPlaceholder="None"
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => resetRowDates(row.key)}
                                >
                                  Use default course dates
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => resetRowToIntakeDates(row.key)}
                                >
                                  Use intake dates
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => resetRowCategory(row.key)}
                                >
                                  Use default category
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => resetRowPaymentPlan(row.key)}
                                >
                                  Use default payment plan
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => resetRowOverrides(row.key)}
                                >
                                  Reset all overrides
                                </Button>
                              </div>
                              <SlotsSimpleScheduleField
                                idPrefix={`row-${row.key}`}
                                slots={rowSlots}
                                onChange={(slots) => setRowSlots(row.key, slots)}
                                overnightConfirmedByIndex={
                                  rowOvernightConfirmed[row.key] ?? {}
                                }
                                onOvernightConfirmedByIndexChange={(next) =>
                                  setRowOvernightConfirmed((prev) => ({
                                    ...prev,
                                    [row.key]: next,
                                  }))
                                }
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => resetRowSlots(row.key)}
                              >
                                Use default schedule
                              </Button>
                            </div>
                            ) : null}
                          </div>
                        </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
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
        {reviewDisabled ? (
          <span
            aria-disabled
            className={cn(
              buttonVariants({ variant: "primary" }),
              "pointer-events-none opacity-50",
            )}
          >
            Review
          </span>
        ) : (
          <Link
            href={reviewHref}
            className={cn(buttonVariants({ variant: "primary" }))}
          >
            Review
          </Link>
        )}
      </div>
    </div>
  );
}
