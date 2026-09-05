"use client";

import EntityCombobox from "@/components/form/entity-combobox";
import { Button } from "@/components/primitives";
import { searchTeachingSubjects } from "@/helpers/user-teaching-subjects";
import { crossfade, crossfadeInstant, revealBar } from "@/lib/sj/motion";
import {
  TeachingSubjectEntityType,
  teachingSubjectRowLabel,
  teachingSubjectSelectionFromRow,
  type UserTeachingSubject,
} from "@/types/user-teaching-subject";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";

export type TeachingSubjectFormState = {
  selection: string;
};

export const emptyTeachingSubjectForm = (): TeachingSubjectFormState => ({
  selection: "",
});

export function teachingSubjectFormFromRow(row: UserTeachingSubject): TeachingSubjectFormState {
  return {
    selection: teachingSubjectSelectionFromRow(row),
  };
}

function formatSearchOptionLabel(
  option: { label: string; entity_type: TeachingSubjectEntityType },
  allowLevelCategorySearch: boolean,
): string {
  if (!allowLevelCategorySearch) {
    return option.label;
  }
  if (option.entity_type === TeachingSubjectEntityType.ProgramLevel) {
    return `${option.label} · Level`;
  }
  if (option.entity_type === TeachingSubjectEntityType.Category) {
    return `${option.label} · Category`;
  }
  return option.label;
}

type TeachingSubjectComposerProps = {
  userId: number;
  open: boolean;
  mode: "add" | "edit";
  form: TeachingSubjectFormState;
  onFormChange: (next: TeachingSubjectFormState) => void;
  editing: UserTeachingSubject | null;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
};

export function TeachingSubjectComposer({
  userId,
  open,
  mode,
  form,
  onFormChange,
  editing,
  onSave,
  onCancel,
  isSaving,
}: TeachingSubjectComposerProps) {
  const reduced = useReducedMotion();
  const barVariants = reduced ? crossfadeInstant : revealBar;
  const contentVariants = reduced ? crossfadeInstant : crossfade;
  const [allowLevelCategorySearch, setAllowLevelCategorySearch] = useState(false);

  const fetchSubjects = useCallback(
    async (searchValue: string) => {
      const res = await searchTeachingSubjects(userId, { q: searchValue });
      setAllowLevelCategorySearch(res.allow_level_category_search);
      const mapped = res.options.map((option) => ({
        value: option.value,
        label: formatSearchOptionLabel(option, res.allow_level_category_search),
      }));
      if (mode === "edit" && editing != null) {
        const currentValue = teachingSubjectSelectionFromRow(editing);
        if (
          currentValue &&
          !mapped.some((option) => option.value === currentValue)
        ) {
          mapped.unshift({
            value: currentValue,
            label: formatSearchOptionLabel(
              {
                label: teachingSubjectRowLabel(editing),
                entity_type: editing.entity_type,
              },
              res.allow_level_category_search,
            ),
          });
        }
      }
      return mapped;
    },
    [userId, mode, editing],
  );

  const selectedLabel =
    mode === "edit" && editing != null ? teachingSubjectRowLabel(editing) : undefined;

  const canSave = Boolean(form.selection);

  const composerTitle = useMemo(
    () => (mode === "add" ? "Add teaching subject" : "Edit teaching subject"),
    [mode],
  );

  const helperCopy = allowLevelCategorySearch
    ? "Search for subjects, grade levels, or categories you can teach."
    : "Search for subjects you can teach.";

  return (
    <div className="min-h-0" style={{ minHeight: open ? undefined : 0 }}>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="teaching-subject-composer"
            variants={barVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden motion-reduce:transition-none"
          >
            <div className="rounded-lg border border-border bg-surface-sunken/40 p-4">
              <motion.div
                key={mode === "add" ? "add" : `edit-${editing?.id}`}
                variants={contentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-4"
              >
                <p className="text-sm font-medium text-text-primary">{composerTitle}</p>
                <p className="text-sm text-text-muted">{helperCopy}</p>

                <EntityCombobox
                  key={mode === "edit" ? `edit-${editing?.id}` : "add"}
                  label="Subjects"
                  value={form.selection || undefined}
                  selectedLabel={selectedLabel}
                  onChange={(value) =>
                    onFormChange({
                      selection: value,
                    })
                  }
                  fetchOptions={fetchSubjects}
                  disabled={isSaving}
                  isSaving={isSaving}
                  widthClassName="w-full"
                  comboboxPlaceholder="Search subjects"
                />

                <div className="flex gap-2">
                  <Button type="button" onClick={onSave} isLoading={isSaving} disabled={!canSave}>
                    Save
                  </Button>
                  <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
                    Cancel
                  </Button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
