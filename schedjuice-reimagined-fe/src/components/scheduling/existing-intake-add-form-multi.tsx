"use client";

import { fetchEntity, makePostRequest, searchEntities } from "@/app/client-api/utils";
import { CourseCategoryField } from "@/components/course/course-category-field";
import EntityCombobox from "@/components/form/entity-combobox";
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
import {
  buildMultiCoursePayloadFromIntakeDefaults,
  parseIntakeGenerationDefaults,
  resolveIntakeAddPaymentPlanId,
  resolveMultiCourseCategoryId,
} from "@/helpers/intake-generation-defaults";
import {
  buildLevelCreateConfig,
  buildSectionCreateConfig,
  invalidateIntakeAddStructureQueries,
  saveProgramLevelSubjects,
  type ProgramLevelCreateResult,
  type ProgramSectionCreateResult,
} from "@/helpers/program-structure-create";
import { createSubjectByName, subjectCreateConfig } from "@/helpers/subject-create-config";
import { useTenant } from "@/hooks/useTenant";
import { operatorEnum } from "@/types/api";
import type { intakeType } from "@/types/intake";
import { programType } from "@/types/program";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash as Trash2 } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type LevelRow = {
  id: number;
  name: string;
  default_category?: number | { id: number } | null;
};

type SectionRow = {
  id: number;
  name: string;
  level: { id: number; name: string } | number;
};

type LevelSubjectRow = {
  level: { id: number; name: string } | number;
  subject: { id: number; name: string } | number;
};

type DraftRow = {
  key: string;
  level_id?: number;
  section_id?: number;
  subject_ids: number[];
  title: string;
};

function createDraftRow(): DraftRow {
  return {
    key: `row:${crypto.randomUUID()}`,
    subject_ids: [],
    title: "",
  };
}

function buildMultiDefaultTitle(
  levelName: string,
  sectionName: string | undefined,
  intakeName: string,
) {
  if (sectionName) {
    return `${levelName} Section ${sectionName} - ${intakeName}`;
  }
  return `${levelName} - ${intakeName}`;
}

export function ExistingIntakeAddFormMulti({
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
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<DraftRow[]>([createDraftRow()]);
  const [categoryOverride, setCategoryOverride] = useState<string>("");
  const [paymentPlanState, setPaymentPlanState] =
    useState<IntakeAddPaymentPlanState>(() => ({
      defaultPaymentPlanId: undefined,
      paymentPlanOverrides: {},
    }));
  const [examDefaults, setExamDefaults] = useState<IntakeExamDefaults>({
    examSessionDate: null,
    examBoard: null,
  });
  const [subjectsById, setSubjectsById] = useState<Record<number, string>>({});
  const [newlyCreatedLevelIds, setNewlyCreatedLevelIds] = useState<Set<number>>(
    () => new Set(),
  );
  const savedLevelSubjectDefaultsRef = useRef<Set<number>>(new Set());
  const pendingLevelCreateRef = useRef<Map<number, ProgramLevelCreateResult>>(
    new Map(),
  );
  const pendingSectionCreateRef = useRef<Map<number, ProgramSectionCreateResult>>(
    new Map(),
  );
  const levelNamesByIdRef = useRef<Map<number, string>>(new Map());

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

  const { data: levelsData, isLoading: levelsLoading } = useQuery({
    queryKey: ["existing-intake-add-levels", programId],
    queryFn: () =>
      searchEntities(
        "program-levels",
        { size: -1, sorts: ["sort_order", "name"], expand: ["default_category"] },
        {
          filter_params: [
            {
              field_name: "program",
              operator: operatorEnum.exact,
              value: programId,
            },
          ],
        },
      ),
    enabled: Boolean(programId),
  });

  const levels = (levelsData?.data?.data ?? []) as LevelRow[];

  const { data: sectionsData } = useQuery({
    queryKey: ["existing-intake-add-sections", programId],
    queryFn: () =>
      searchEntities(
        "program-level-sections",
        { size: -1, expand: ["level"], sorts: ["sort_order", "name"] },
        {
          filter_params: [
            {
              field_name: "level__program",
              operator: operatorEnum.exact,
              value: programId,
            },
          ],
        },
      ),
    enabled: Boolean(programId),
  });

  const sectionsByLevelId = useMemo(() => {
    const map: Record<number, SectionRow[]> = {};
    for (const section of (sectionsData?.data?.data ?? []) as SectionRow[]) {
      const levelId =
        typeof section.level === "object" ? section.level.id : section.level;
      if (!map[levelId]) map[levelId] = [];
      map[levelId].push(section);
    }
    return map;
  }, [sectionsData]);

  const { data: levelSubjectsData, isLoading: levelSubjectsLoading } = useQuery({
    queryKey: ["existing-intake-add-level-subjects", programId],
    queryFn: async () => {
      const res = await searchEntities(
        "program-level-subjects",
        { size: -1, expand: ["subject", "level"] },
        {
          filter_params: [
            {
              field_name: "level__program",
              operator: operatorEnum.exact,
              value: programId,
            },
          ],
        },
      );
      const subjectMap: Record<number, string> = {};
      const byLevel: Record<number, number[]> = {};
      for (const row of (res?.data?.data ?? []) as LevelSubjectRow[]) {
        const levelId =
          typeof row.level === "object" ? row.level.id : row.level;
        const subjectId =
          typeof row.subject === "object" ? row.subject.id : row.subject;
        const subjectName =
          typeof row.subject === "object" ? row.subject.name : `Subject ${subjectId}`;
        subjectMap[subjectId] = subjectName;
        if (!byLevel[levelId]) byLevel[levelId] = [];
        byLevel[levelId].push(subjectId);
      }
      return { subjectMap, byLevel };
    },
    enabled: Boolean(programId),
  });

  const levelSubjectsByLevelId = levelSubjectsData?.byLevel ?? {};

  const { data: subjectsData } = useQuery({
    queryKey: ["existing-intake-add-subjects"],
    queryFn: () =>
      searchEntities("subjects", { fields: ["id", "name"], sorts: ["name"], size: -1 }),
  });

  useEffect(() => {
    if (!levelSubjectsData?.subjectMap) return;
    setSubjectsById((prev) => ({ ...prev, ...levelSubjectsData.subjectMap }));
  }, [levelSubjectsData?.subjectMap]);

  useEffect(() => {
    const map: Record<number, string> = {};
    for (const subject of (subjectsData?.data?.data ?? []) as {
      id: number;
      name: string;
    }[]) {
      map[subject.id] = subject.name;
    }
    if (Object.keys(map).length > 0) {
      setSubjectsById((prev) => ({ ...prev, ...map }));
    }
  }, [subjectsData]);

  const levelsById = useMemo(() => {
    const map: Record<number, LevelRow> = {};
    for (const level of levels) {
      map[level.id] = level;
    }
    return map;
  }, [levels]);

  const sectionsById = useMemo(() => {
    const map: Record<number, SectionRow> = {};
    for (const sections of Object.values(sectionsByLevelId)) {
      for (const section of sections) {
        map[section.id] = section;
      }
    }
    return map;
  }, [sectionsByLevelId]);

  const intakeHasCategory = useMemo(() => {
    if (!intake) return false;
    return parseIntakeGenerationDefaults(intake).category_id != null;
  }, [intake]);

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
    if (!intake || intakeHasCategory) return false;
    return rows.some((row) => {
      if (!row.level_id) return false;
      const level = levelsById[row.level_id];
      return (
        resolveMultiCourseCategoryId(intake, level, categoryOverride) == null
      );
    });
  }, [intake, intakeHasCategory, rows, levelsById, categoryOverride]);

  const createCourses = useMutation({
    mutationFn: async (draftRows: DraftRow[]) => {
      if (!program || !intake) throw new Error("Missing program or intake");
      const createdIds: number[] = [];

      for (const row of draftRows) {
        if (!row.level_id || !row.title.trim()) {
          throw new Error("Each class needs a level and title.");
        }
        if (row.subject_ids.length === 0) {
          throw new Error("Each class needs at least one subject.");
        }

        const level = levelsById[row.level_id];
        const categoryId = resolveMultiCourseCategoryId(
          intake,
          level,
          categoryOverride,
        );
        if (categoryId == null) {
          throw new Error("Category is required.");
        }

        const rowPlanOverride = paymentPlanState.paymentPlanOverrides[row.key];
        const effectivePaymentPlanId = resolveIntakeAddPaymentPlanId(
          intake,
          paymentPlanState.defaultPaymentPlanId,
          rowPlanOverride,
        );

        const payload = buildMultiCoursePayloadFromIntakeDefaults(
          intake,
          program.id,
          {
            level_id: row.level_id,
            section_id: row.section_id,
            title: row.title.trim(),
            category_id: categoryId,
            ...(effectivePaymentPlanId != null
              ? { payment_plan_id: effectivePaymentPlanId }
              : {}),
            exam_session_date: examDefaults.examSessionDate,
            exam_board: examDefaults.examBoard,
          },
        );

        const res = await makePostRequest("courses", payload);
        const courseId = res?.data?.data?.id;
        if (courseId == null) {
          throw new Error("Course was created but no id was returned.");
        }

        for (let i = 0; i < row.subject_ids.length; i++) {
          await makePostRequest("course-subjects", {
            course: courseId,
            subject: row.subject_ids[i],
            sort_order: i,
          });
        }

        if (
          row.level_id != null &&
          newlyCreatedLevelIds.has(row.level_id) &&
          !savedLevelSubjectDefaultsRef.current.has(row.level_id)
        ) {
          await saveProgramLevelSubjects(row.level_id, row.subject_ids);
          savedLevelSubjectDefaultsRef.current.add(row.level_id);
        }

        createdIds.push(courseId);
      }

      return createdIds;
    },
    onSuccess: (createdIds) => {
      toast.add({
        title:
          createdIds.length === 1
            ? "Class created"
            : `${createdIds.length} classes created`,
      });
      if (createdIds.length === 1) {
        router.push(
          `/courses/${createdIds[0]}/edit?tab=edit-schedule&ref=/intakes/${intakeId}`,
        );
        return;
      }
      router.push(`/intakes/${intakeId}`);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Could not create classes";
      toast.add({
        title: message,
      });
    },
  });

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function setRowLevel(key: string, levelId: number | null | undefined) {
    if (!intake || levelId == null) {
      updateRow(key, {
        level_id: undefined,
        section_id: undefined,
        subject_ids: [],
        title: "",
      });
      return;
    }

    const pending = pendingLevelCreateRef.current.get(levelId);
    if (pending) {
      pendingLevelCreateRef.current.delete(levelId);
      updateRow(key, {
        level_id: levelId,
        section_id: pending.sectionId,
        subject_ids: [],
        title: buildMultiDefaultTitle(
          pending.levelName,
          pending.sectionName,
          intake.name,
        ),
      });
      return;
    }

    const level = levelsById[levelId];
    const subjectIds = [...(levelSubjectsByLevelId[levelId] ?? [])];
    const title = buildMultiDefaultTitle(
      level?.name ?? "Level",
      undefined,
      intake.name,
    );
    updateRow(key, {
      level_id: levelId,
      section_id: undefined,
      subject_ids: subjectIds,
      title,
    });
  }

  function setRowSection(key: string, sectionId: number | null | undefined) {
    const row = rows.find((r) => r.key === key);
    if (!intake || !row?.level_id) {
      updateRow(key, { section_id: undefined });
      return;
    }

    const levelName =
      levelsById[row.level_id]?.name ??
      levelNamesByIdRef.current.get(row.level_id) ??
      "Level";
    const pending =
      sectionId != null
        ? pendingSectionCreateRef.current.get(sectionId)
        : undefined;
    if (pending && sectionId != null) {
      pendingSectionCreateRef.current.delete(sectionId);
      updateRow(key, {
        section_id: sectionId,
        title: buildMultiDefaultTitle(
          levelName,
          pending.sectionName,
          intake.name,
        ),
      });
      return;
    }

    const section = sectionId != null ? sectionsById[sectionId] : undefined;
    const title = buildMultiDefaultTitle(levelName, section?.name, intake.name);
    updateRow(key, {
      section_id: sectionId ?? undefined,
      title,
    });
  }

  function addSubjectToRow(key: string, subjectId: number) {
    const row = rows.find((r) => r.key === key);
    if (!row || row.subject_ids.includes(subjectId)) return;
    updateRow(key, { subject_ids: [...row.subject_ids, subjectId] });
  }

  function removeSubjectFromRow(key: string, subjectId: number) {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    updateRow(key, {
      subject_ids: row.subject_ids.filter((id) => id !== subjectId),
    });
  }

  function handleSubjectCreated(subjectId: number, name: string) {
    setSubjectsById((prev) => ({ ...prev, [subjectId]: name }));
  }

  function addRow() {
    setRows((prev) => [...prev, createDraftRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((row) => row.key !== key),
    );
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
    rows.every(
      (row) =>
        row.level_id != null &&
        row.title.trim() &&
        row.subject_ids.length > 0,
    ) &&
    !needsCategory &&
    (!examFieldsEnabled || intakeExamDefaultsComplete(examDefaults));

  const isLoading =
    programLoading ||
    intakeLoading ||
    levelsLoading ||
    levelSubjectsLoading;

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  if (!program || !intake) {
    return (
      <p className="text-sm text-destructive">
        Could not load program or intake.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add classes to intake</h1>
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
              <h2 className="text-sm font-medium">Class {index + 1}</h2>
              {rows.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove class"
                  onClick={() => removeRow(row.key)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>

            <EntityCombobox
              entity="program-levels"
              queryParams={{
                size: -1,
                sorts: ["sort_order", "name"],
                expand: ["default_category"],
              }}
              filterParams={{
                filter_params: [
                  {
                    field_name: "program",
                    operator: operatorEnum.exact,
                    value: programId,
                  },
                ],
              }}
              displayFunction={(entity) => entity.name}
              value={row.level_id != null ? String(row.level_id) : ""}
              onChange={(v) =>
                setRowLevel(row.key, v ? parseInt(v, 10) : undefined)
              }
              label="Level"
              comboboxPlaceholder="Select level"
              onCreateNew={buildLevelCreateConfig(
                programId,
                levels.length,
                async (result) => {
                  pendingLevelCreateRef.current.set(result.levelId, result);
                  levelNamesByIdRef.current.set(result.levelId, result.levelName);
                  setNewlyCreatedLevelIds((prev) => new Set(prev).add(result.levelId));
                  await invalidateIntakeAddStructureQueries(queryClient, programId);
                },
              )}
            />

            {row.level_id != null ? (
              <EntityCombobox
                entity="program-level-sections"
                queryParams={{ size: -1, sorts: ["sort_order", "name"] }}
                filterParams={{
                  filter_params: [
                    {
                      field_name: "level",
                      operator: operatorEnum.exact,
                      value: String(row.level_id),
                    },
                  ],
                }}
                displayFunction={(entity) => entity.name}
                value={row.section_id != null ? String(row.section_id) : ""}
                onChange={(v) =>
                  setRowSection(row.key, v ? parseInt(v, 10) : undefined)
                }
                label="Section"
                comboboxPlaceholder="Select section (optional)"
                onCreateNew={buildSectionCreateConfig(
                  row.level_id,
                  (sectionsByLevelId[row.level_id] ?? []).length,
                  async (result) => {
                    pendingSectionCreateRef.current.set(result.sectionId, result);
                    await invalidateIntakeAddStructureQueries(queryClient, programId);
                  },
                )}
              />
            ) : null}

            {row.level_id != null ? (
              <Field.Root className="w-full space-y-2">
                <Field.Label>Subjects</Field.Label>
                <div className="flex flex-wrap gap-2">
                  {row.subject_ids.map((subjectId) => (
                    <span
                      key={subjectId}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                    >
                      {subjectsById[subjectId] ?? `Subject ${subjectId}`}
                      <button
                        type="button"
                        className="text-text-muted hover:text-text-primary"
                        onClick={() =>
                          removeSubjectFromRow(row.key, subjectId)
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {row.subject_ids.length === 0 ? (
                    <span className="text-sm text-text-muted">
                      No subjects selected
                    </span>
                  ) : null}
                </div>
                <EntityCombobox
                  entity="subjects"
                  displayFunction={(e) => e.name}
                  value=""
                  onChange={(v) => {
                    if (v) addSubjectToRow(row.key, parseInt(v, 10));
                  }}
                  label={`Add subject`}
                  onCreateNew={{
                    ...subjectCreateConfig,
                    create: async (name) => {
                      const id = await createSubjectByName(name);
                      handleSubjectCreated(id, name);
                      addSubjectToRow(row.key, id);
                      return id;
                    },
                  }}
                />
              </Field.Root>
            ) : null}

            <Field.Root className="w-full">
              <Field.Label>Title</Field.Label>
              <Input
                value={row.title}
                onChange={(e) => updateRow(row.key, { title: e.target.value })}
                placeholder="Class title"
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
          Add another class
        </Button>
      </div>

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
          onClick={() => createCourses.mutate(rows)}
        >
          Create {rows.length === 1 ? "class" : "classes"}
        </Button>
      </div>
    </div>
  );
}
