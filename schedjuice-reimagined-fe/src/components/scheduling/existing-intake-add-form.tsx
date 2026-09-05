"use client";

import { fetchEntity, makePostRequest, searchEntities } from "@/app/client-api/utils";
import { CourseCategoryField } from "@/components/course/course-category-field";
import { CourseSubjectField } from "@/components/course/course-subject-field";
import { Button, buttonVariants } from "@/components/primitives";
import { Input } from "@/components/primitives";
import { Field } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import {
  IntakeAddDefaultPaymentPlanField,
  IntakeAddRowPaymentPlanField,
  type IntakeAddPaymentPlanState,
} from "@/components/scheduling/intake-add-payment-plan-fields";
import {
  IntakeExamDefaultsFields,
  intakeExamDefaultsComplete,
  type IntakeExamDefaults,
} from "@/components/scheduling/intake-add-exam-fields";
import { SlotsSimpleScheduleField } from "@/components/scheduling/slots-simple-schedule-field";
import {
  createCourseThenOptionalSchedule,
  validateRecurringSlotsForCreate,
} from "@/helpers/create-course-schedule";
import {
  buildCoursePayloadFromIntakeDefaults,
  parseIntakeGenerationDefaults,
  resolveIntakeAddPaymentPlanId,
} from "@/helpers/intake-generation-defaults";
import {
  countExistingCoursesBySubject,
  nextDuplicateSubjectTitle,
} from "@/helpers/intake-course-titles";
import { useTenant } from "@/hooks/useTenant";
import { operatorEnum } from "@/types/api";
import type { intakeType, RecurringSlot } from "@/types/intake";
import { ExistingIntakeAddFormMulti } from "@/components/scheduling/existing-intake-add-form-multi";
import { SubjectStrategy, programType } from "@/types/program";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash as Trash2 } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type DraftRow = {
  key: string;
  subject_id?: number;
  title: string;
};

function createDraftRow(): DraftRow {
  return {
    key: `row:${crypto.randomUUID()}`,
    title: "",
  };
}

function buildDefaultTitle(
  programName: string,
  subjectName: string,
  intakeName: string,
) {
  return `${programName} ${subjectName} - ${intakeName}`;
}

export function ExistingIntakeAddForm({
  programId,
  intakeId,
}: {
  programId: string;
  intakeId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { tenant } = useTenant();
  const examFieldsEnabled = Boolean(tenant?.is_exam_board_in_course_enabled);
  const [rows, setRows] = useState<DraftRow[]>([createDraftRow()]);
  const [categoryOverride, setCategoryOverride] = useState<string>("");
  const [slots, setSlots] = useState<RecurringSlot[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [paymentPlanState, setPaymentPlanState] =
    useState<IntakeAddPaymentPlanState>(() => ({
      defaultPaymentPlanId: undefined,
      paymentPlanOverrides: {},
    }));
  const [examDefaults, setExamDefaults] = useState<IntakeExamDefaults>({
    examSessionDate: null,
    examBoard: null,
  });

  useEffect(() => {
    if (rows.length > 1) {
      setSlots([]);
      setScheduleError(null);
    }
  }, [rows.length]);

  const { data: programData, isLoading: programLoading } = useQuery({
    queryKey: ["existing-intake-add-program", programId],
    queryFn: () => fetchEntity("programs", programId),
  });
  const program = programData?.data?.data as programType | undefined;

  const { data: intakeData, isLoading: intakeLoading } = useQuery({
    queryKey: ["existing-intake-add-intake", intakeId],
    queryFn: () => fetchEntity("intakes", intakeId),
  });
  const intake = intakeData?.data?.data as intakeType | undefined;

  useEffect(() => {
    if (!intake) return;
    const defaults = parseIntakeGenerationDefaults(intake);
    const intakePlanId = defaults.payment_plan_id;
    if (intakePlanId != null) {
      setPaymentPlanState((prev) =>
        prev.defaultPaymentPlanId != null
          ? prev
          : { ...prev, defaultPaymentPlanId: intakePlanId },
      );
    }
    setExamDefaults((prev) => ({
      examSessionDate:
        prev.examSessionDate ?? defaults.exam_session_date ?? null,
      examBoard: prev.examBoard ?? defaults.exam_board ?? null,
    }));
  }, [intake]);

  const { data: existingCoursesData } = useQuery({
    queryKey: ["existing-intake-add-courses", intakeId],
    queryFn: () =>
      searchEntities(
        "courses",
        { fields: ["id", "subject"], page: 1, size: 500 },
        {
          filter_params: [
            {
              field_name: "intake",
              operator: operatorEnum.exact,
              value: intakeId,
            },
          ],
        },
      ),
    enabled: Boolean(intakeId),
  });

  const { data: subjectsData } = useQuery({
    queryKey: ["existing-intake-add-subjects"],
    queryFn: () =>
      searchEntities("subjects", { fields: ["id", "name"], sorts: ["name"], size: -1 }),
  });

  const subjectsById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const subject of (subjectsData?.data?.data ?? []) as {
      id: number;
      name: string;
    }[]) {
      map[subject.id] = subject.name;
    }
    return map;
  }, [subjectsData]);

  const existingSubjectCounts = useMemo(
    () =>
      countExistingCoursesBySubject(
        (existingCoursesData?.data?.data ?? []) as Array<{
          subject?: number | { id: number } | null;
        }>,
      ),
    [existingCoursesData],
  );

  const defaultsSummary = useMemo(() => {
    if (!intake) return null;
    const defaults = parseIntakeGenerationDefaults(intake);
    const parts: string[] = [];
    if (defaults.category_id != null) parts.push("category");
    if (defaults.payment_plan_id != null) parts.push("payment plan");
    if (defaults.start_date || defaults.end_date) parts.push("course dates");
    if (defaults.description) parts.push("description");
    return parts.length > 0 ? parts.join(", ") : "intake dates only";
  }, [intake]);

  const needsCategory = useMemo(() => {
    if (!intake) return true;
    return parseIntakeGenerationDefaults(intake).category_id == null;
  }, [intake]);

  const createCourses = useMutation({
    mutationFn: async (draftRows: DraftRow[]) => {
      if (!program || !intake) throw new Error("Missing program or intake");

      if (draftRows.length === 1) {
        const slotErr = validateRecurringSlotsForCreate(slots);
        if (slotErr) {
          throw new Error(slotErr);
        }
      }

      const createdIds: number[] = [];
      let scheduleErrorResult: string | undefined;

      for (const row of draftRows) {
        if (!row.subject_id || !row.title.trim()) {
          throw new Error("Each course needs a subject and title.");
        }
        const rowPlanOverride = paymentPlanState.paymentPlanOverrides[row.key];
        const effectivePaymentPlanId = resolveIntakeAddPaymentPlanId(
          intake,
          paymentPlanState.defaultPaymentPlanId,
          rowPlanOverride,
        );
        const payload = buildCoursePayloadFromIntakeDefaults(
          intake,
          program.id,
          {
            subject_id: row.subject_id,
            title: row.title.trim(),
            ...(effectivePaymentPlanId != null
              ? { payment_plan_id: effectivePaymentPlanId }
              : {}),
            exam_session_date: examDefaults.examSessionDate,
            exam_board: examDefaults.examBoard,
          },
        );
        if (needsCategory) {
          if (!categoryOverride) {
            throw new Error("Category is required.");
          }
          payload.category = parseInt(categoryOverride, 10);
        }

        if (draftRows.length === 1) {
          const start = new Date(String(payload.start_date));
          const end = new Date(String(payload.end_date));
          const result = await createCourseThenOptionalSchedule({
            coursePayload: payload,
            slots,
            title: String(payload.title ?? row.title),
            startDate: start,
            endDate: end,
          });
          createdIds.push(result.courseId);
          scheduleErrorResult = result.scheduleError;
          break;
        }

        const res = await makePostRequest("courses", payload);
        const id = res?.data?.data?.id;
        if (id != null) createdIds.push(id);
      }
      return { createdIds, scheduleError: scheduleErrorResult };
    },
    onSuccess: (result) => {
      const { createdIds, scheduleError: scheduleErr } = result;
      if (scheduleErr) {
        toast.add({ type: "error", title: scheduleErr });
      } else {
        toast.add({
          title:
            createdIds.length === 1
              ? "Course created"
              : `${createdIds.length} courses created`,
        });
      }
      if (createdIds.length === 1) {
        router.push(
          `/courses/${createdIds[0]}/edit?tab=edit-schedule&ref=/intakes/${intakeId}`,
        );
        return;
      }
      router.push(`/intakes/${intakeId}`);
    },
    onError: (err) => {
      if (err instanceof Error && /weekday|time|session/i.test(err.message)) {
        setScheduleError(err.message);
        return;
      }
      toast.add({
        title: "Could not create courses",
      });
    },
  });

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function setRowSubject(key: string, subjectId: number | null | undefined) {
    if (!program || !intake || subjectId == null) {
      updateRow(key, { subject_id: undefined, title: "" });
      return;
    }

    const subjectName = subjectsById[subjectId] ?? "Subject";
    const baseTitle = buildDefaultTitle(program.name, subjectName, intake.name);
    const pendingBefore = rows.filter(
      (row) => row.key !== key && row.subject_id === subjectId,
    ).length;
    const title = nextDuplicateSubjectTitle(
      baseTitle,
      existingSubjectCounts[subjectId] ?? 0,
      pendingBefore,
    );
    updateRow(key, { subject_id: subjectId, title });
  }

  function addRow() {
    setRows((prev) => [...prev, createDraftRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.key !== key)));
  }

  function setDefaultPaymentPlan(planId: number | undefined) {
    setPaymentPlanState((prev) => ({ ...prev, defaultPaymentPlanId: planId }));
  }

  function setRowPaymentPlan(rowKey: string, planId: number | undefined) {
    setPaymentPlanState((prev) => {
      const next = { ...prev.paymentPlanOverrides };
      if (planId == null) {
        delete next[rowKey];
      } else {
        next[rowKey] = planId;
      }
      return { ...prev, paymentPlanOverrides: next };
    });
  }

  function clearRowPaymentPlan(rowKey: string) {
    setPaymentPlanState((prev) => {
      const next = { ...prev.paymentPlanOverrides };
      delete next[rowKey];
      return { ...prev, paymentPlanOverrides: next };
    });
  }

  const canSubmit =
    rows.every((row) => row.subject_id != null && row.title.trim()) &&
    (!needsCategory || Boolean(categoryOverride)) &&
    (!examFieldsEnabled || intakeExamDefaultsComplete(examDefaults));

  if (programLoading || intakeLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  if (!program || !intake) {
    return (
      <p className="text-sm text-destructive">
        Could not load program or intake.
      </p>
    );
  }

  if (program.subject_strategy === SubjectStrategy.multi) {
    return (
      <ExistingIntakeAddFormMulti programId={programId} intakeId={intakeId} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add courses to intake</h1>
        <p className="text-sm text-text-muted">
          {program.name} — {intake.name}
        </p>
        {defaultsSummary ? (
          <p className="text-xs text-text-muted mt-1">
            Prefilled from intake defaults: {defaultsSummary}
          </p>
        ) : null}
      </div>

      {needsCategory ? (
        <CourseCategoryField
          value={categoryOverride ? Number(categoryOverride) : null}
          onChange={(v) =>
            setCategoryOverride(v != null && v > 0 ? String(v) : "")
          }
          label="Category"
          placeholder="Select category"
          allowDeselect={false}
        />
      ) : null}

      <IntakeAddDefaultPaymentPlanField
        defaultPaymentPlanId={paymentPlanState.defaultPaymentPlanId}
        onChange={setDefaultPaymentPlan}
      />

      {examFieldsEnabled ? (
        <IntakeExamDefaultsFields
          value={examDefaults}
          onChange={setExamDefaults}
          required
        />
      ) : null}

      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={row.key} className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Course {index + 1}</h2>
              {rows.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove course"
                  onClick={() => removeRow(row.key)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
            <CourseSubjectField
              programId={program.id}
              subjectStrategy={SubjectStrategy.required}
              value={row.subject_id}
              onChange={(value) => setRowSubject(row.key, value)}
            />
            <Field.Root className="w-full">
              <Field.Label>Title</Field.Label>
              <Input
                value={row.title}
                onChange={(e) => updateRow(row.key, { title: e.target.value })}
                placeholder="Course title"
              />
            </Field.Root>
            <IntakeAddRowPaymentPlanField
              rowKey={row.key}
              state={paymentPlanState}
              onSetOverride={setRowPaymentPlan}
              onClearOverride={clearRowPaymentPlan}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={addRow}>
          <Plus className="mr-2 size-4" />
          Add another course
        </Button>
      </div>

      {rows.length === 1 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-text-primary">
            Weekly sessions (optional)
          </h3>
          <p className="text-sm text-text-muted">
            Leave days empty to create the class without sessions. You can add
            them on the Schedule tab next.
          </p>
          <SlotsSimpleScheduleField
            slots={slots}
            onChange={(next) => {
              setSlots(next);
              setScheduleError(null);
            }}
            idPrefix="intake-add"
          />
          {scheduleError ? (
            <p className="text-sm text-destructive" role="alert">
              {scheduleError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-between">
        <Link
          href={`/courses/create/program/${programId}`}
          className={cn(buttonVariants({ variant: "secondary" }))}
        >
          Back
        </Link>
        <Button
          type="button"
          disabled={!canSubmit || createCourses.isLoading}
          isLoading={createCourses.isLoading}
          onClick={() => {
            if (rows.length === 1) {
              const slotErr = validateRecurringSlotsForCreate(slots);
              if (slotErr) {
                setScheduleError(slotErr);
                return;
              }
            }
            createCourses.mutate(rows);
          }}
        >
          Create {rows.length === 1 ? "course" : "courses"}
        </Button>
      </div>
    </div>
  );
}
