"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Button, Checkbox } from "@/components/primitives";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { searchEntities, updateEntity } from "@/app/client-api/utils";
import type { entityType } from "@/components/form/multi-select-popover";
import { RecordSection } from "@/components/record/record-section";
import { revealBar, savedTick } from "@/lib/sj/motion";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import type { accountType } from "@/types/user";
import { WarningTriangle as AlertTriangle, Check } from "iconoir-react";

type NamedEntity = entityType & { name?: string };
type TeamsSyncPhase = "updating" | "done" | null;
type SaveFeedback = "success" | "error" | null;

const SAVE_FEEDBACK_DISMISS_MS = 3000;

function ScopeCheckboxGrid({
  catalog,
  selectedIds,
  onToggle,
  disabled,
  idPrefix,
}: {
  catalog: NamedEntity[];
  selectedIds: Set<number>;
  onToggle: (id: number, checked: boolean) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  if (!catalog.length) {
    return (
      <p className="text-sm text-muted-foreground">No items configured.</p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {catalog.map((item) => {
        const id = Number(item.id);
        const inputId = `${idPrefix}-${id}`;
        return (
          <div key={id} className="flex items-center gap-3">
            <Checkbox
              id={inputId}
              checked={selectedIds.has(id)}
              disabled={disabled}
              onCheckedChange={(checked) => onToggle(id, checked === true)}
            />
            <label htmlFor={inputId} className="cursor-pointer font-normal">
              {item.name ?? String(item.id)}
            </label>
          </div>
        );
      })}
    </div>
  );
}

function ScopeSectionHeader({
  label,
  canEdit,
  hasItems,
  onSelectAll,
  onClear,
}: {
  label: string;
  canEdit: boolean;
  hasItems: boolean;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-sm font-medium">{label}</p>
      {canEdit && hasItems ? (
        <div className="flex gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            className="hover:text-foreground"
            onClick={onSelectAll}
          >
            Select all
          </button>
          <span aria-hidden>·</span>
          <button
            type="button"
            className="hover:text-foreground"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CourseOversightScopeEditor({
  subject,
  recordQueryKey,
}: {
  subject: accountType;
  recordQueryKey: unknown[];
}) {
  const { can } = usePermissions();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const canEdit = can("user.update");
  const [teamsSyncPhase, setTeamsSyncPhase] = useState<TeamsSyncPhase>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>(null);
  const teamsSyncEnabled = Boolean(
    tenant?.is_microsoft_on && tenant?.is_teams_creation_enabled !== false,
  );

  const subjectProgramIds = subject.scoped_program_ids ?? [];
  const subjectCategoryIds = subject.scoped_category_ids ?? [];

  const programsQuery = useQuery({
    queryKey: ["oversightScopePrograms"],
    queryFn: () =>
      searchEntities("programs", {
        size: -1,
        fields: ["id", "name"],
        sorts: ["name"],
      }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["oversightScopeCategories"],
    queryFn: () =>
      searchEntities("categories", {
        size: -1,
        fields: ["id", "name"],
        sorts: ["name"],
      }),
  });

  const programCatalog: NamedEntity[] = programsQuery.data?.data?.data ?? [];
  const categoryCatalog: NamedEntity[] = categoriesQuery.data?.data?.data ?? [];

  const [draftProgramIds, setDraftProgramIds] = useState<Set<number>>(new Set());
  const [draftCategoryIds, setDraftCategoryIds] = useState<Set<number>>(
    new Set(),
  );

  useEffect(() => {
    setDraftProgramIds(new Set(subjectProgramIds));
  }, [subjectProgramIds]);

  useEffect(() => {
    setDraftCategoryIds(new Set(subjectCategoryIds));
  }, [subjectCategoryIds]);

  useEffect(() => {
    if (teamsSyncPhase !== "updating") return;
    const toDone = window.setTimeout(() => setTeamsSyncPhase("done"), 4000);
    return () => clearTimeout(toDone);
  }, [teamsSyncPhase]);

  useEffect(() => {
    if (teamsSyncPhase !== "done") return;
    const clear = window.setTimeout(() => setTeamsSyncPhase(null), 3000);
    return () => clearTimeout(clear);
  }, [teamsSyncPhase]);

  useEffect(() => {
    if (!saveFeedback) return;
    const clear = window.setTimeout(
      () => setSaveFeedback(null),
      SAVE_FEEDBACK_DISMISS_MS,
    );
    return () => clearTimeout(clear);
  }, [saveFeedback]);

  const dirty =
    JSON.stringify(Array.from(draftProgramIds).sort((a, b) => a - b)) !==
      JSON.stringify([...subjectProgramIds].sort((a, b) => a - b)) ||
    JSON.stringify(Array.from(draftCategoryIds).sort((a, b) => a - b)) !==
      JSON.stringify([...subjectCategoryIds].sort((a, b) => a - b));

  const save = useMutation({
    mutationFn: () =>
      updateEntity("users", String(subject.id), {
        scoped_program_ids: Array.from(draftProgramIds),
        scoped_category_ids: Array.from(draftCategoryIds),
      }),
    onSuccess: () => {
      setSaveFeedback("success");
      qc.invalidateQueries({ queryKey: recordQueryKey });
      if (teamsSyncEnabled) {
        setTeamsSyncPhase("updating");
      }
    },
    onError: () => {
      setSaveFeedback("error");
    },
  });

  const handleCancel = () => {
    setDraftProgramIds(new Set(subjectProgramIds));
    setDraftCategoryIds(new Set(subjectCategoryIds));
    setSaveFeedback(null);
  };

  const clearSaveFeedback = () => setSaveFeedback(null);

  const hasScope =
    subjectProgramIds.length > 0 || subjectCategoryIds.length > 0;

  const programIdsFromCatalog = useMemo(
    () =>
      programCatalog
        .map((e) => Number(e.id))
        .filter((id) => Number.isFinite(id)),
    [programCatalog],
  );

  const categoryIdsFromCatalog = useMemo(
    () =>
      categoryCatalog
        .map((e) => Number(e.id))
        .filter((id) => Number.isFinite(id)),
    [categoryCatalog],
  );

  if (!canEdit && !hasScope) {
    return null;
  }

  return (
    <RecordSection title="Course oversight scope">
      <p className="mb-4 text-sm text-muted-foreground">
        Courses in these programs or categories appear in this person&apos;s course
        list. When Microsoft Teams is enabled, they are added as team owners for
        those classes.
      </p>

      <AnimatePresence>
        {teamsSyncEnabled && teamsSyncPhase ? (
          <motion.p
            key={teamsSyncPhase}
            {...savedTick}
            className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
          >
            {teamsSyncPhase === "updating" ? (
              <>
                <Spinner className="h-3.5 w-3.5 " />
                Updating Teams access…
              </>
            ) : (
              "Teams access updated"
            )}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <div className="flex flex-col gap-6">
        <div>
          <ScopeSectionHeader
            label="Programs"
            canEdit={canEdit}
            hasItems={programCatalog.length > 0}
            onSelectAll={() => {
              clearSaveFeedback();
              setDraftProgramIds(new Set(programIdsFromCatalog));
            }}
            onClear={() => {
              clearSaveFeedback();
              setDraftProgramIds(new Set());
            }}
          />
          <ScopeCheckboxGrid
            catalog={programCatalog}
            selectedIds={draftProgramIds}
            onToggle={(id, checked) => {
              clearSaveFeedback();
              setDraftProgramIds((prev) => {
                const next = new Set(prev);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
              });
            }}
            disabled={!canEdit}
            idPrefix="scope-program"
          />
        </div>

        <div>
          <ScopeSectionHeader
            label="Categories"
            canEdit={canEdit}
            hasItems={categoryCatalog.length > 0}
            onSelectAll={() => {
              clearSaveFeedback();
              setDraftCategoryIds(new Set(categoryIdsFromCatalog));
            }}
            onClear={() => {
              clearSaveFeedback();
              setDraftCategoryIds(new Set());
            }}
          />
          <ScopeCheckboxGrid
            catalog={categoryCatalog}
            selectedIds={draftCategoryIds}
            onToggle={(id, checked) => {
              clearSaveFeedback();
              setDraftCategoryIds((prev) => {
                const next = new Set(prev);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
              });
            }}
            disabled={!canEdit}
            idPrefix="scope-category"
          />
        </div>
      </div>

      <AnimatePresence>
        {canEdit && (dirty || saveFeedback) ? (
          <motion.div
            {...revealBar}
            className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4"
          >
            {dirty ? (
              <>
                <Button
                  size="sm"
                  onClick={() => save.mutate()}
                  isLoading={save.isPending}
                >
                  Save scope
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancel}
                  disabled={save.isPending}
                >
                  Cancel
                </Button>
              </>
            ) : null}
            <AnimatePresence mode="wait">
              {saveFeedback ? (
                <motion.span
                  key={saveFeedback}
                  {...savedTick}
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-sm motion-reduce:transition-none"
                >
                  {saveFeedback === "success" ? (
                    <>
                      <Check className="size-3.5 text-success" aria-hidden />
                      <span className="text-success">Scope saved</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle
                        className="size-3.5 text-destructive"
                        aria-hidden
                      />
                      <span className="text-destructive">
                        Could not save scope
                      </span>
                    </>
                  )}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </RecordSection>
  );
}
