"use client";

import { searchEntities } from "@/app/client-api/utils";
import EntityCombobox from "@/components/form/entity-combobox";
import { MultiCombobox } from "@/components/form/multi-combo-box";
import { Button, Field, Spinner } from "@/components/primitives";
import { listToApiArray } from "@/helpers/filter-params";
import { monthKey } from "@/helpers/payment-coverage-months";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import {
  ensureStudentEnrollments,
  type EnsureStudentEnrollmentsError,
} from "@/lib/finances/payment-enrollment";
import {
  defaultCoveragePlanForCourse,
  type CoveragePlanState,
} from "@/lib/finances/payment-coverage-plan";
import { searchUploadEnrollment } from "@/lib/finances/upload-enrollment";
import { cn } from "@/lib/utils";
import type { filterParamsBody } from "@/types/api";
import { operatorEnum } from "@/types/api";
import { CourseCreationMethod } from "@/types/program";
import { role } from "@/types/user";
import { useQuery } from "@tanstack/react-query";
import { Xmark } from "iconoir-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  EnrollmentCourseCard,
  type CourseMeta,
  type CourseSelection,
} from "./enrollment-course-card";

const STUDENT_FILTER_PARAMS: filterParamsBody = {
  filter_params: [
    {
      field_name: "roles",
      operator: operatorEnum.contained_by,
      value: listToApiArray([role.student]),
    },
  ],
};

const ACTIVE_PROGRAM_FILTER_PARAMS: filterParamsBody = {
  filter_params: [
    { field_name: "is_active", operator: operatorEnum.exact, value: "true" },
  ],
};

export type StudentEntry = {
  key: string;
  userId: string;
  programId: string;
  selectedProgram: {
    id: number;
    course_creation_method?: string;
  } | null;
  intakeId: string;
  selectedCourseIds: string[];
  courses: CourseSelection[];
  enrollmentByCourseId: Record<string, number | null>;
  enrollErrorsByCourseId: Record<string, string>;
  enrollingCourseIds: Set<string>;
};

export function createStudentEntry(initialUserId = ""): StudentEntry {
  return {
    key: `student-${crypto.randomUUID()}`,
    userId: initialUserId,
    programId: "",
    selectedProgram: null,
    intakeId: "",
    selectedCourseIds: [],
    courses: [],
    enrollmentByCourseId: {},
    enrollErrorsByCourseId: {},
    enrollingCourseIds: new Set(),
  };
}

function coverageMonthKey(coverage: CoveragePlanState): string {
  return monthKey(
    coverage.monthDate.getFullYear(),
    coverage.monthDate.getMonth() + 1,
  );
}

function coursesNeedEnrollmentSync(
  prev: CourseSelection[],
  next: CourseSelection[],
): boolean {
  if (prev.length !== next.length) return true;
  return next.some((course, index) => {
    const previous = prev[index];
    return (
      !previous ||
      previous.courseId !== course.courseId ||
      previous.enrollmentId !== course.enrollmentId
    );
  });
}

export function StudentPaymentEntrySection({
  entryKey,
  entry,
  index,
  canRemove,
  defaultBillingMonth,
  currencySymbol,
  autoEnrollEnabled,
  onUpdateEntry,
  onRemove,
  onCoursesChanged,
}: {
  entryKey: string;
  entry: StudentEntry;
  index: number;
  canRemove: boolean;
  defaultBillingMonth: Date;
  currencySymbol: string;
  autoEnrollEnabled: boolean;
  onUpdateEntry: (key: string, patch: Partial<StudentEntry>) => void;
  onRemove: () => void;
  onCoursesChanged: () => void;
}) {
  const applyPatch = useCallback(
    (patch: Partial<StudentEntry>) => onUpdateEntry(entryKey, patch),
    [entryKey, onUpdateEntry],
  );

  const coursesRef = useRef(entry.courses);
  coursesRef.current = entry.courses;

  const enrollmentByCourseIdRef = useRef(entry.enrollmentByCourseId);
  enrollmentByCourseIdRef.current = entry.enrollmentByCourseId;

  const entryRef = useRef(entry);
  entryRef.current = entry;

  const showIntake =
    entry.selectedProgram?.course_creation_method ===
    CourseCreationMethod.intake_based;

  const courseSelectorTriggerLabel =
    showIntake && entry.programId && !entry.intakeId
      ? "Choose intake first"
      : "Select courses";

  const coursesQuery = useQuery({
    queryKey: [
      "enrollment-payment-courses",
      entry.key,
      entry.programId,
      entry.intakeId,
      showIntake,
    ],
    enabled: Boolean(entry.programId) && (!showIntake || Boolean(entry.intakeId)),
    queryFn: async () => {
      const filter_params: {
        field_name: string;
        operator: operatorEnum;
        value: string;
      }[] = [
        {
          field_name: "program",
          operator: operatorEnum.exact,
          value: entry.programId,
        },
      ];
      if (showIntake && entry.intakeId) {
        filter_params.push({
          field_name: "intake",
          operator: operatorEnum.exact,
          value: entry.intakeId,
        });
      }
      const res = await searchEntities(
        "courses",
        { size: 200, sorts: ["title"], expand: ["payment_plan"] },
        { filter_params },
      );
      return (res.data?.data ?? []) as CourseMeta[];
    },
  });

  useEffect(() => {
    if (
      !entry.userId.trim() ||
      !isValidApiEntityIdParam(entry.userId) ||
      !coursesQuery.data
    ) {
      if (Object.keys(entry.enrollmentByCourseId).length > 0) {
        applyPatch({ enrollmentByCourseId: {} });
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, number | null> = {};
      await Promise.all(
        coursesQuery.data!.map(async (course) => {
          const enrollment = await searchUploadEnrollment(
            entry.userId,
            String(course.id),
          );
          next[String(course.id)] = enrollment?.id ?? null;
        }),
      );
      if (!cancelled) applyPatch({ enrollmentByCourseId: next });
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPatch, entry.enrollmentByCourseId, entry.userId, coursesQuery.data]);

  const courseOptions = useMemo(() => {
    return (coursesQuery.data ?? []).map((course) => {
      const enrolled = entry.enrollmentByCourseId[String(course.id)] != null;
      return {
        value: String(course.id),
        label: enrolled ? course.title : `${course.title} (not enrolled)`,
        disabled: !autoEnrollEnabled && !enrolled,
      };
    });
  }, [coursesQuery.data, entry.enrollmentByCourseId, autoEnrollEnabled]);

  const syncCoursesFromSelection = useCallback(
    (ids: string[]) => {
      if (!entry.userId.trim() || !isValidApiEntityIdParam(entry.userId)) {
        if (coursesRef.current.length > 0) {
          applyPatch({ courses: [] });
        }
        return;
      }
      const metaById = new Map(
        (coursesQuery.data ?? []).map((c) => [String(c.id), c]),
      );
      const prevCourses = coursesRef.current;
      const prevIds = prevCourses.map((c) => String(c.courseId));
      const selectionChanged =
        ids.length !== prevIds.length ||
        ids.some((id, i) => id !== prevIds[i]);

      const enrollmentByCourseId = enrollmentByCourseIdRef.current;
      const prevById = new Map(prevCourses.map((c) => [c.courseId, c]));
      const next: CourseSelection[] = [];
      for (const id of ids) {
        const meta = metaById.get(id);
        if (!meta) continue;
        const existing = prevById.get(meta.id);
        next.push({
          courseId: meta.id,
          title: meta.title,
          startDate: meta.start_date ?? null,
          endDate: meta.end_date ?? meta.start_date ?? null,
          enrollmentId:
            enrollmentByCourseId[id] ?? existing?.enrollmentId ?? null,
          paymentPlan: meta.payment_plan ?? null,
          planPrice: existing?.planPrice ?? null,
          discountSelection:
            existing?.discountSelection ?? { discountIds: [] },
          invoicedAmount: existing?.invoicedAmount ?? null,
          feeBreakdown: existing?.feeBreakdown ?? null,
          coverage:
            existing?.coverage ??
            defaultCoveragePlanForCourse(
              meta.start_date,
              meta.end_date ?? meta.start_date,
              defaultBillingMonth,
            ),
          coverageTouched: existing?.coverageTouched ?? false,
          furthestCoveredKey: existing?.furthestCoveredKey ?? null,
          coverageError: existing?.coverageError,
        });
      }

      if (
        selectionChanged ||
        coursesNeedEnrollmentSync(prevCourses, next)
      ) {
        applyPatch({ courses: next });
      }
      if (selectionChanged) onCoursesChanged();
    },
    [
      coursesQuery.data,
      defaultBillingMonth,
      entry.userId,
      applyPatch,
      onCoursesChanged,
    ],
  );

  useEffect(() => {
    syncCoursesFromSelection(entry.selectedCourseIds);
  }, [entry.selectedCourseIds, syncCoursesFromSelection]);

  useEffect(() => {
    const prevCourses = coursesRef.current;
    if (prevCourses.length === 0) return;

    const nextCourses = prevCourses.map((course) =>
      course.coverageTouched
        ? course
        : {
            ...course,
            coverage: defaultCoveragePlanForCourse(
              course.startDate,
              course.endDate,
              defaultBillingMonth,
            ),
          },
    );

    const coverageChanged = nextCourses.some((course, index) => {
      const previous = prevCourses[index];
      if (course.coverageTouched || previous.coverageTouched) return false;
      return (
        coverageMonthKey(course.coverage) !==
        coverageMonthKey(previous.coverage)
      );
    });

    if (coverageChanged) {
      applyPatch({ courses: nextCourses });
      onCoursesChanged();
    }
  }, [applyPatch, defaultBillingMonth, onCoursesChanged]);

  const enrollCoursesOnSelect = useCallback(
    async (courseIds: string[]) => {
      const currentEntry = entryRef.current;
      if (
        !autoEnrollEnabled ||
        courseIds.length === 0 ||
        !currentEntry.userId.trim() ||
        !isValidApiEntityIdParam(currentEntry.userId)
      ) {
        return;
      }
      const enrolling = new Set(currentEntry.enrollingCourseIds);
      for (const id of courseIds) enrolling.add(id);
      applyPatch({ enrollingCourseIds: enrolling });

      const enrollErrors = { ...currentEntry.enrollErrorsByCourseId };
      for (const id of courseIds) delete enrollErrors[id];
      applyPatch({ enrollErrorsByCourseId: enrollErrors });

      try {
        const result = await ensureStudentEnrollments(
          Number(currentEntry.userId),
          courseIds.map(Number),
        );
        const enrollmentByCourseId = { ...currentEntry.enrollmentByCourseId };
        for (const row of result.enrollments) {
          enrollmentByCourseId[String(row.course_id)] = row.user_course_id;
        }
        applyPatch({ enrollmentByCourseId });
      } catch (error) {
        const enrollError = error as EnsureStudentEnrollmentsError;
        const failedIds = new Set(Object.keys(enrollError.courseErrors ?? {}));
        const latestEntry = entryRef.current;
        if (enrollError.partialEnrollments?.length) {
          const enrollmentByCourseId = { ...latestEntry.enrollmentByCourseId };
          for (const row of enrollError.partialEnrollments) {
            enrollmentByCourseId[String(row.course_id)] = row.user_course_id;
          }
          applyPatch({ enrollmentByCourseId });
        }
        applyPatch({
          enrollErrorsByCourseId: {
            ...latestEntry.enrollErrorsByCourseId,
            ...(enrollError.courseErrors ?? {}),
          },
        });
        if (failedIds.size > 0) {
          applyPatch({
            selectedCourseIds: latestEntry.selectedCourseIds.filter(
              (id) => !failedIds.has(id),
            ),
          });
        }
      } finally {
        const latestEntry = entryRef.current;
        const enrollingDone = new Set(latestEntry.enrollingCourseIds);
        for (const id of courseIds) enrollingDone.delete(id);
        applyPatch({ enrollingCourseIds: enrollingDone });
      }
    },
    [autoEnrollEnabled, applyPatch],
  );

  const handleCourseSelectionChange = (next: string[]) => {
    const filtered = autoEnrollEnabled
      ? next
      : next.filter((id) => entry.enrollmentByCourseId[id] != null);
    const added = filtered.filter(
      (id) => !entry.selectedCourseIds.includes(id),
    );
    applyPatch({ selectedCourseIds: filtered });
    if (!autoEnrollEnabled) return;
    const needsEnroll = added.filter(
      (id) => entry.enrollmentByCourseId[id] == null,
    );
    if (needsEnroll.length > 0) {
      void enrollCoursesOnSelect(needsEnroll);
    }
  };

  const removeCourse = (courseId: number) => {
    applyPatch({
      selectedCourseIds: entry.selectedCourseIds.filter(
        (id) => Number(id) !== courseId,
      ),
    });
  };

  const updateCourse = useCallback(
    (courseId: number, patch: Partial<CourseSelection>) => {
      const courses = coursesRef.current;
      const current = courses.find((c) => c.courseId === courseId);
      if (!current) return;
      const unchanged = Object.entries(patch).every(([key, value]) => {
        const field = key as keyof CourseSelection;
        if (field === "discountSelection") {
          return (
            JSON.stringify(current.discountSelection) === JSON.stringify(value)
          );
        }
        if (field === "feeBreakdown") {
          return JSON.stringify(current.feeBreakdown) === JSON.stringify(value);
        }
        return current[field] === value;
      });
      if (unchanged) return;
      applyPatch({
        courses: courses.map((c) =>
          c.courseId === courseId ? { ...c, ...patch } : c,
        ),
      });
      if (patch.discountSelection != null || patch.coverage != null) {
        onCoursesChanged();
      }
    },
    [applyPatch, onCoursesChanged],
  );

  return (
    <section
      className="space-y-4 rounded-md border border-border p-3"
      aria-labelledby={`student-entry-${entry.key}-heading`}
    >
      <div className="flex items-start justify-between gap-2">
        <h2
          id={`student-entry-${entry.key}-heading`}
          className="text-sm font-medium text-foreground"
        >
          Student {index + 1}
        </h2>
        {canRemove ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 text-danger hover:bg-danger/10 hover:text-danger"
            onClick={onRemove}
          >
            Remove student
          </Button>
        ) : null}
      </div>

      <EntityCombobox
        entity="users"
        value={entry.userId}
        onChange={(userId) => {
          applyPatch({
            userId,
            selectedCourseIds: [],
            courses: [],
            enrollmentByCourseId: {},
            enrollErrorsByCourseId: {},
          });
          onCoursesChanged();
        }}
        label="Student"
        displayFunction={(u: { name?: string }) => u.name ?? "—"}
        filterParams={STUDENT_FILTER_PARAMS}
        hideLabel={false}
      />

      <EntityCombobox
        entity="programs"
        value={entry.programId}
        onChange={(programId) => {
          applyPatch({
            programId,
            selectedProgram: null,
            intakeId: "",
            selectedCourseIds: [],
            courses: [],
          });
          onCoursesChanged();
        }}
        label="Program"
        displayFunction={(p: { name?: string }) => p.name ?? "—"}
        onSelectedEntityChange={(p) => {
          applyPatch({
            selectedProgram: p ?? null,
            intakeId: "",
            selectedCourseIds: [],
            courses: [],
          });
          onCoursesChanged();
        }}
        filterParams={ACTIVE_PROGRAM_FILTER_PARAMS}
      />

      {showIntake ? (
        <EntityCombobox
          entity="intakes"
          value={entry.intakeId}
          onChange={(intakeId) => {
            applyPatch({ intakeId, selectedCourseIds: [], courses: [] });
            onCoursesChanged();
          }}
          label="Intake"
          displayFunction={(i: { name?: string }) => i.name ?? "—"}
          filterParams={
            entry.programId
              ? {
                  filter_params: [
                    {
                      field_name: "program",
                      operator: operatorEnum.exact,
                      value: entry.programId,
                    },
                  ],
                }
              : undefined
          }
          disabled={!entry.programId}
        />
      ) : null}

      <Field.Root className="w-full gap-1.5">
        <Field.Label>Select courses</Field.Label>
        <MultiCombobox
          options={courseOptions}
          value={entry.selectedCourseIds}
          onChange={handleCourseSelectionChange}
          triggerLabel={courseSelectorTriggerLabel}
          triggerClassName="w-full justify-between min-w-0"
          contentClassName="min-w-[var(--anchor-width)] w-[var(--anchor-width)] max-w-[min(100vw-2rem,36rem)]"
          disabled={!entry.programId || (showIntake && !entry.intakeId)}
          isLoading={coursesQuery.isLoading}
        />
        <Field.Description>
          {showIntake && entry.programId && !entry.intakeId
            ? "Select an intake to load courses for this program."
            : "Pick the courses this student is paying for."}
        </Field.Description>
      </Field.Root>

      {entry.selectedCourseIds.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {entry.selectedCourseIds.map((id) => {
            const meta = coursesQuery.data?.find((c) => String(c.id) === id);
            const enrolled = entry.enrollmentByCourseId[id] != null;
            const enrolling = entry.enrollingCourseIds.has(id);
            const error = entry.enrollErrorsByCourseId[id];
            return (
              <span
                key={id}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                  error
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-border bg-muted/40 text-foreground",
                )}
              >
                <span className="truncate">{meta?.title ?? id}</span>
                {enrolling ? (
                  <Spinner className="size-3 shrink-0" aria-hidden />
                ) : error ? (
                  <span className="shrink-0 text-amber-800">Failed</span>
                ) : enrolled ? (
                  <span className="shrink-0 text-text-muted">Enrolled</span>
                ) : (
                  <span className="shrink-0 text-text-muted">Not enrolled</span>
                )}
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 hover:bg-muted"
                  aria-label={`Remove ${meta?.title ?? id}`}
                  onClick={() => removeCourse(Number(id))}
                >
                  <Xmark className="size-3.5" aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {entry.courses.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Per-course pricing</p>
          {entry.courses.map((course) => (
            <EnrollmentCourseCard
              key={`${entry.key}-${course.courseId}`}
              course={course}
              userId={entry.userId}
              defaultBillingMonth={defaultBillingMonth}
              currencySymbol={currencySymbol}
              isEnrolling={entry.enrollingCourseIds.has(String(course.courseId))}
              enrollError={
                entry.enrollErrorsByCourseId[String(course.courseId)] ?? null
              }
              onRemove={() => removeCourse(course.courseId)}
              onUpdateCourse={updateCourse}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
