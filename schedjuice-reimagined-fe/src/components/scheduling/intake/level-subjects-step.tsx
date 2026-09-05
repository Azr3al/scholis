"use client";

import { makePostRequest, searchEntities, setupProgramCurriculum } from "@/app/client-api/utils";
import {
  createSubjectByName,
  subjectCreateConfig,
} from "@/helpers/subject-create-config";
import EntityCombobox from "@/components/form/entity-combobox";
import { Button, buttonVariants } from "@/components/primitives";
import { Input } from "@/components/primitives";
import { Field } from "@/components/primitives";
import { Skeleton } from "@/components/primitives";
import { useCreateFlow } from "@/components/scheduling/create-flow-context";
import {
  getNextIntakeStep,
  getPrevIntakeStep,
  intakeStepPath,
  type IntakeFlowContext,
  type IntakeStepId,
} from "@/components/scheduling/intake/intake-steps";
import { useToast } from "@/components/primitives";
import {
  buildDefaultLevelSectionOverrides,
  defaultSectionSelectionsForLevel,
  ensureProgramSectionsForIntake,
  groupSectionsByLevel,
  sectionNameExists,
  validateLevelSectionsForSubjects,
  type ProgramSectionRow,
} from "@/helpers/intake-sections";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { cn } from "@/lib/utils";
import { operatorEnum } from "@/types/api";
import type { LevelSectionSelection } from "@/types/intake";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type LevelRow = { id: number; name: string };
type LevelSubjectRow = {
  id: number;
  level: { id: number; name: string } | number;
  subject: { id: number; name: string } | number;
};
type SectionRow = {
  id: number;
  name: string;
  level: { id: number; name: string } | number;
  sort_order?: number;
};

export function LevelSubjectsStep({
  programId,
  stepId,
  flowContext,
}: {
  programId: string;
  stepId: IntakeStepId;
  flowContext: IntakeFlowContext;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { state, setState, clearIntakePreviewState } = useCreateFlow();
  const [subjectsById, setSubjectsById] = useState<Record<number, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    data: levelsData,
    isLoading: isLoadingLevels,
  } = useQuery({
    queryKey: ["intake-levels", programId],
    queryFn: () =>
      searchEntities(
        "program-levels",
        { size: -1, sorts: ["sort_order", "name"] },
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
  });

  const levels = (levelsData?.data?.data ?? []) as LevelRow[];

  const {
    data: subjectsData,
    isLoading: isLoadingSubjects,
    refetch: refetchSubjects,
  } = useQuery({
    queryKey: ["subjects-for-intake"],
    queryFn: () =>
      searchEntities("subjects", { fields: ["id", "name"], sorts: ["name"], size: -1 }),
  });

  const subjectCatalog = useMemo(
    () =>
      (subjectsData?.data?.data ?? []) as {
        id: number;
        name: string;
      }[],
    [subjectsData],
  );

  const catalogEmpty = !isLoadingSubjects && subjectCatalog.length === 0;

  const levelIdsKey = levels.map((level) => level.id).join(",");

  const {
    data: loadedOverrides,
    isLoading: isLoadingLevelSubjects,
    isSuccess: levelSubjectsLoaded,
  } = useQuery({
    queryKey: ["intake-level-subjects", programId, levelIdsKey],
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
      const rows = (res?.data?.data ?? []) as LevelSubjectRow[];
      const overrides: Record<number, number[]> = {};
      for (const row of rows) {
        const levelId =
          typeof row.level === "object" ? row.level.id : row.level;
        const subjectId =
          typeof row.subject === "object" ? row.subject.id : row.subject;
        if (!overrides[levelId]) overrides[levelId] = [];
        overrides[levelId].push(subjectId);
      }
      return overrides;
    },
    enabled: levels.length > 0,
  });

  const {
    data: programSectionsData,
    isLoading: isLoadingProgramSections,
    isSuccess: programSectionsLoaded,
  } = useQuery({
    queryKey: ["intake-program-sections", programId, levelIdsKey],
    queryFn: async () => {
      const res = await searchEntities(
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
      );
      const rows = (res?.data?.data ?? []) as SectionRow[];
      const mapped: ProgramSectionRow[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        levelId: typeof row.level === "object" ? row.level.id : row.level,
      }));
      return groupSectionsByLevel(mapped);
    },
    enabled: levels.length > 0,
  });

  const programSectionsByLevel = programSectionsData ?? {};

  useEffect(() => {
    if (!levelSubjectsLoaded || state.levelSubjectOverrides !== undefined) return;
    setState({ levelSubjectOverrides: loadedOverrides ?? {} });
  }, [
    levelSubjectsLoaded,
    loadedOverrides,
    setState,
    state.levelSubjectOverrides,
  ]);

  useEffect(() => {
    if (!programSectionsLoaded || state.levelSectionOverrides !== undefined) return;
    setState({
      levelSectionOverrides: buildDefaultLevelSectionOverrides(
        programSectionsByLevel,
      ),
    });
  }, [
    programSectionsByLevel,
    programSectionsLoaded,
    setState,
    state.levelSectionOverrides,
  ]);

  const isHydratingOverrides =
    levels.length > 0 &&
    (isLoadingLevelSubjects ||
      (levelSubjectsLoaded && state.levelSubjectOverrides === undefined));

  const isHydratingSectionOverrides =
    levels.length > 0 &&
    (isLoadingProgramSections ||
      (programSectionsLoaded && state.levelSectionOverrides === undefined));

  const isLoadingCurriculum =
    isLoadingLevels ||
    isLoadingSubjects ||
    isHydratingOverrides ||
    isHydratingSectionOverrides;

  useEffect(() => {
    setSubjectsById((prev) => {
      const next = { ...prev };
      for (const subject of subjectCatalog) {
        next[subject.id] = subject.name;
      }
      return next;
    });
  }, [subjectCatalog]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const sectionOverrides = state.levelSectionOverrides ?? {};
      const updatedSectionOverrides = await ensureProgramSectionsForIntake(
        sectionOverrides,
        programSectionsByLevel,
        async (levelId, name, sortOrder) => {
          const res = await makePostRequest("program-level-sections", {
            level: levelId,
            name,
            sort_order: sortOrder,
          });
          const id = res?.data?.data?.id ?? res?.data?.id;
          if (id == null) {
            throw new Error(`Section "${name}" was created but no id was returned.`);
          }
          return { id, name };
        },
      );
      setState({ levelSectionOverrides: updatedSectionOverrides });

      const assignments: { level: number; subject: number; sort_order: number }[] =
        [];
      for (const level of levels) {
        const subjectIds = state.levelSubjectOverrides?.[level.id] ?? [];
        subjectIds.forEach((subjectId, sortOrder) => {
          assignments.push({
            level: level.id,
            subject: subjectId,
            sort_order: sortOrder,
          });
        });
      }

      await setupProgramCurriculum(programId, assignments);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["intake-program-sections", programId],
      });
      clearIntakePreviewState();
      router.push(
        intakeStepPath(
          programId,
          getNextIntakeStep(stepId, flowContext)!,
        ),
      );
    },
    onError: (error: unknown) => {
      toast.add({
        title: "Could not save curriculum",
        description: parseSchedjuiceApiError(error, "Could not save curriculum."),
      });
    },
  });

  const getLevelSubjectIds = useCallback(
    (levelId: number) => state.levelSubjectOverrides?.[levelId] ?? [],
    [state.levelSubjectOverrides],
  );

  const getLevelSections = useCallback(
    (levelId: number) => state.levelSectionOverrides?.[levelId] ?? [],
    [state.levelSectionOverrides],
  );

  function setLevelSections(levelId: number, sections: LevelSectionSelection[]) {
    setValidationError(null);
    setState({
      levelSectionOverrides: {
        ...state.levelSectionOverrides,
        [levelId]: sections,
      },
    });
  }

  function handleAddSection(levelId: number, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = getLevelSections(levelId);
    if (sectionNameExists(current, trimmed)) return;
    const programMatch = (programSectionsByLevel[levelId] ?? []).find(
      (section) => section.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    setLevelSections(levelId, [
      ...current,
      programMatch
        ? { name: programMatch.name, sectionId: programMatch.id }
        : { name: trimmed },
    ]);
  }

  function handleRemoveSection(levelId: number, index: number) {
    setLevelSections(
      levelId,
      getLevelSections(levelId).filter((_, i) => i !== index),
    );
  }

  function handleResetSections(levelId: number) {
    setLevelSections(
      levelId,
      defaultSectionSelectionsForLevel(programSectionsByLevel[levelId] ?? []),
    );
  }

  function handleContinue() {
    const sectionError = validateLevelSectionsForSubjects(
      levels,
      state.levelSubjectOverrides ?? {},
      state.levelSectionOverrides,
    );
    if (sectionError) {
      setValidationError(sectionError);
      return;
    }
    setValidationError(null);
    saveMutation.mutate();
  }

  function setLevelSubjectIds(levelId: number, ids: number[]) {
    setState({
      levelSubjectOverrides: {
        ...state.levelSubjectOverrides,
        [levelId]: ids,
      },
    });
  }

  function handleAddSubject(levelId: number, subjectId: number) {
    const current = getLevelSubjectIds(levelId);
    if (current.includes(subjectId)) return;
    setLevelSubjectIds(levelId, [...current, subjectId]);
  }

  function handleRemoveSubject(levelId: number, subjectId: number) {
    setLevelSubjectIds(
      levelId,
      getLevelSubjectIds(levelId).filter((id) => id !== subjectId),
    );
  }

  function handleSubjectCreated(subjectId: number, name: string) {
    setSubjectsById((prev) => ({ ...prev, [subjectId]: name }));
    void refetchSubjects();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Curriculum by level</h1>
        <p className="text-sm text-text-muted">
          Choose subjects and sections for each level this intake. New section
          names are saved to the program when you continue; removing a section here
          only excludes it from this intake.
        </p>
      </div>

      {validationError ? (
        <p className="text-sm text-destructive">{validationError}</p>
      ) : null}

      {catalogEmpty && !isLoadingCurriculum && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          You need to add subjects before you can build a curriculum. Create
          your first subject below, then assign it to each level.
        </div>
      )}

      {isLoadingCurriculum ? (
        <LevelSubjectsLoadingSkeleton levelCount={levels.length || 3} />
      ) : levels.length === 0 ? (
        <p className="text-sm text-text-muted">
          Add at least one level in the structure step.
        </p>
      ) : (
        levels.map((level) => (
          <LevelSubjectBlock
            key={level.id}
            level={level}
            subjectIds={getLevelSubjectIds(level.id)}
            sections={getLevelSections(level.id)}
            programDefaultSections={programSectionsByLevel[level.id] ?? []}
            subjectsById={subjectsById}
            catalogEmpty={catalogEmpty}
            onAdd={(subjectId) => handleAddSubject(level.id, subjectId)}
            onRemove={(subjectId) => handleRemoveSubject(level.id, subjectId)}
            onSubjectCreated={handleSubjectCreated}
            onAddSection={(name) => handleAddSection(level.id, name)}
            onRemoveSection={(index) => handleRemoveSection(level.id, index)}
            onResetSections={() => handleResetSections(level.id)}
          />
        ))
      )}

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
        <Button
          type="button"
          onClick={handleContinue}
          disabled={isLoadingCurriculum || levels.length === 0 || saveMutation.isPending}
          isLoading={saveMutation.isPending}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

function LevelSubjectsLoadingSkeleton({ levelCount }: { levelCount: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: Math.max(levelCount, 1) }).map((_, index) => (
        <LevelSubjectBlockSkeleton key={index} />
      ))}
    </div>
  );
}

function LevelSubjectBlockSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-7 w-16 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-14 rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function LevelSubjectBlock({
  level,
  subjectIds,
  sections,
  programDefaultSections,
  subjectsById,
  catalogEmpty,
  onAdd,
  onRemove,
  onSubjectCreated,
  onAddSection,
  onRemoveSection,
  onResetSections,
}: {
  level: LevelRow;
  subjectIds: number[];
  sections: LevelSectionSelection[];
  programDefaultSections: ProgramSectionRow[];
  subjectsById: Record<number, string>;
  catalogEmpty: boolean;
  onAdd: (subjectId: number) => void;
  onRemove: (subjectId: number) => void;
  onSubjectCreated: (subjectId: number, name: string) => void;
  onAddSection: (name: string) => void;
  onRemoveSection: (index: number) => void;
  onResetSections: () => void;
}) {
  const [sectionName, setSectionName] = useState("");
  const hasPendingProgramSections = sections.some(
    (section) => section.sectionId == null,
  );
  const programDefaultLabel =
    programDefaultSections.length > 0
      ? programDefaultSections.map((section) => section.name).join(", ")
      : "None configured";

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{level.name}</h3>
        <span className="text-xs text-text-muted">
          {subjectIds.length} subject{subjectIds.length === 1 ? "" : "s"} ·{" "}
          {sections.length} section{sections.length === 1 ? "" : "s"}
        </span>
      </div>

      <Field.Root className="w-full space-y-2 rounded-md border bg-surface-hover/10 p-3">
        <Field.Label className="text-xs text-text-muted">
          Sections for this intake
        </Field.Label>
        <div className="flex flex-wrap gap-2">
          {sections.map((section, index) => (
            <span
              key={`${section.name}-${index}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border bg-surface px-2 py-1 text-sm",
                section.sectionId == null && "border-dashed",
              )}
            >
              {section.name}
              {section.sectionId == null ? (
                <span className="text-xs text-text-muted">(new)</span>
              ) : null}
              <button
                type="button"
                className="text-text-muted hover:text-text-primary"
                onClick={() => onRemoveSection(index)}
              >
                ×
              </button>
            </span>
          ))}
          {sections.length === 0 ? (
            <span className="text-sm text-text-muted">No sections selected</span>
          ) : null}
        </div>
        {hasPendingProgramSections ? (
          <p className="text-xs text-text-muted">
            New sections will be added to the program when you continue.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Input
            value={sectionName}
            onChange={(event) => setSectionName(event.target.value)}
            placeholder={`Add section to ${level.name}`}
            className="max-w-xs"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAddSection(sectionName);
                setSectionName("");
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              onAddSection(sectionName);
              setSectionName("");
            }}
          >
            Add section
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onResetSections}>
            Reset to default
          </Button>
        </div>
        <p className="text-xs text-text-muted">
          Program default: {programDefaultLabel}
        </p>
      </Field.Root>

      <Field.Root className="w-full space-y-2">
        <Field.Label className="text-xs text-text-muted">Subjects</Field.Label>
        <div className="flex flex-wrap gap-2">
          {subjectIds.map((sid) => (
            <span
              key={sid}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
            >
              {subjectsById[sid] ?? `Subject ${sid}`}
              <button
                type="button"
                className="text-text-muted hover:text-text-primary"
                onClick={() => onRemove(sid)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <EntityCombobox
          entity="subjects"
          displayFunction={(e) => e.name}
          value=""
          onChange={(v) => {
            if (v) onAdd(parseInt(v, 10));
          }}
          label={
            catalogEmpty
              ? "Create your first subject"
              : `Add subject to ${level.name}`
          }
          onCreateNew={{
            ...subjectCreateConfig,
            create: async (name) => {
              const id = await createSubjectByName(name);
              onSubjectCreated(id, name);
              return id;
            },
          }}
        />
      </Field.Root>
    </div>
  );
}
