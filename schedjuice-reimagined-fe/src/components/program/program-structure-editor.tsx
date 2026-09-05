"use client";
import { Button, Input, buttonVariants, inputClassName } from "@/components/primitives";

import {
  deleteEntity,
  searchEntities,
} from "@/app/client-api/utils";
import {
  createProgramLevelWithDefaultSection,
  createProgramSection,
} from "@/helpers/program-structure-create";
import {
  createDraftLevel,
  createDraftSection,
  type DraftLevel,
} from "@/types/program";
import { operatorEnum } from "@/types/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

type PersistLevelRow = {
  id: number;
  name: string;
  sort_order?: number;
};

type PersistSectionRow = {
  id: number;
  name: string;
};

type DraftEditorProps = {
  mode: "draft";
  value: DraftLevel[];
  onChange: (value: DraftLevel[]) => void;
};

type PersistEditorProps = {
  mode: "persist";
  programId: string;
};

export type ProgramStructureEditorProps = DraftEditorProps | PersistEditorProps;

function SectionTags({
  sections,
  canRemove,
  onRemove,
}: {
  sections: { key: string; name: string; canRemove: boolean }[];
  canRemove: (key: string) => boolean;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {sections.map((section) => {
        const removable = canRemove(section.key);
        return (
          <span
            key={section.key}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
          >
            {section.name}
            {removable ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove section ${section.name}`}
                onClick={() => onRemove(section.key)}
              >
                ×
              </button>
            ) : (
              <span
                className="text-muted-foreground cursor-not-allowed"
                title="Each level needs at least one section"
              >
                ×
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function DraftStructureEditor({
  value,
  onChange,
}: {
  value: DraftLevel[];
  onChange: (value: DraftLevel[]) => void;
}) {
  const [levelName, setLevelName] = useState("");
  const [sectionNames, setSectionNames] = useState<Record<string, string>>({});

  function addLevel() {
    const trimmed = levelName.trim();
    if (!trimmed) return;
    onChange([...value, createDraftLevel(trimmed, value.length)]);
    setLevelName("");
  }

  function removeLevel(clientId: string) {
    onChange(value.filter((level) => level.clientId !== clientId));
  }

  function addSection(levelClientId: string) {
    const sectionName = (sectionNames[levelClientId] ?? "").trim();
    if (!sectionName) return;

    onChange(
      value.map((level) => {
        if (level.clientId !== levelClientId) return level;
        return {
          ...level,
          sections: [
            ...level.sections,
            createDraftSection(sectionName, level.sections.length),
          ],
        };
      }),
    );
    setSectionNames((prev) => ({ ...prev, [levelClientId]: "" }));
  }

  function removeSection(levelClientId: string, sectionClientId: string) {
    onChange(
      value.map((level) => {
        if (level.clientId !== levelClientId) return level;
        if (level.sections.length <= 1) return level;
        return {
          ...level,
          sections: level.sections.filter(
            (section) => section.clientId !== sectionClientId,
          ),
        };
      }),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 items-end max-w-md">
        <div className="flex-1 space-y-1">
          <label>New level (e.g. Year 1)</label>
          <Input
            value={levelName}
            onChange={(e) => setLevelName(e.target.value)}
            placeholder="Year 1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLevel();
              }
            }}
          />
        </div>
        <Button type="button" onClick={addLevel} disabled={!levelName.trim()}>
          Add level
        </Button>
      </div>

      {value.map((level) => (
        <div key={level.clientId} className="border rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-medium">{level.name}</h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeLevel(level.clientId)}
            >
              Remove level
            </Button>
          </div>

          <div className="space-y-2 pl-2 border-l">
            <label className="text-xs text-muted-foreground">Sections</label>
            <div className="flex gap-2">
              <Input
                value={sectionNames[level.clientId] ?? ""}
                onChange={(e) =>
                  setSectionNames((prev) => ({
                    ...prev,
                    [level.clientId]: e.target.value,
                  }))
                }
                placeholder="A"
                className="max-w-[120px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSection(level.clientId);
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => addSection(level.clientId)}
                disabled={!(sectionNames[level.clientId] ?? "").trim()}
              >
                Add section
              </Button>
            </div>
            <SectionTags
              sections={level.sections.map((section) => ({
                key: section.clientId,
                name: section.name,
                canRemove: level.sections.length > 1,
              }))}
              canRemove={() => level.sections.length > 1}
              onRemove={(sectionClientId) =>
                removeSection(level.clientId, sectionClientId)
              }
            />
          </div>
        </div>
      ))}

      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No levels yet. Add levels for K-12 style intake generation.
        </p>
      )}
    </div>
  );
}

function PersistLevelSections({
  levelId,
  sections,
  refetch,
}: {
  levelId: string;
  sections: PersistSectionRow[];
  refetch: () => void;
}) {
  const [sectionName, setSectionName] = useState("");

  const addSection = useMutation({
    mutationFn: () =>
      createProgramSection(
        parseInt(levelId, 10),
        sectionName.trim(),
        sections.length,
      ),
    onSuccess: () => {
      setSectionName("");
      refetch();
    },
  });

  const removeSection = useMutation({
    mutationFn: (id: number) =>
      deleteEntity("program-level-sections", String(id)),
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-2 pl-2 border-l">
      <label className="text-xs text-muted-foreground">Sections</label>
      <div className="flex gap-2">
        <Input
          value={sectionName}
          onChange={(e) => setSectionName(e.target.value)}
          placeholder="A"
          className="max-w-[120px]"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (sectionName.trim()) addSection.mutate();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => addSection.mutate()}
          disabled={!sectionName.trim()}
          isLoading={addSection.isLoading}
        >
          Add section
        </Button>
      </div>
      <SectionTags
        sections={sections.map((section) => ({
          key: String(section.id),
          name: section.name,
          canRemove: sections.length > 1,
        }))}
        canRemove={() => sections.length > 1}
        onRemove={(sectionId) => {
          if (sections.length <= 1) return;
          removeSection.mutate(parseInt(sectionId, 10));
        }}
      />
    </div>
  );
}

function PersistStructureEditor({ programId }: { programId: string }) {
  const [levelName, setLevelName] = useState("");
  const { data, refetch } = useQuery({
    queryKey: ["programLevels", programId],
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

  const levels = (data?.data?.data ?? []) as PersistLevelRow[];

  const addLevel = useMutation({
    mutationFn: async () => {
      await createProgramLevelWithDefaultSection(
        programId,
        levelName.trim(),
        levels.length,
      );
    },
    onSuccess: () => {
      setLevelName("");
      refetch();
    },
  });

  const removeLevel = useMutation({
    mutationFn: (id: number) => deleteEntity("program-levels", String(id)),
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-6">
      <div className="flex gap-2 items-end max-w-md">
        <div className="flex-1 space-y-1">
          <label>New level (e.g. Year 1)</label>
          <Input
            value={levelName}
            onChange={(e) => setLevelName(e.target.value)}
            placeholder="Year 1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (levelName.trim()) addLevel.mutate();
              }
            }}
          />
        </div>
        <Button
          type="button"
          onClick={() => addLevel.mutate()}
          disabled={!levelName.trim()}
          isLoading={addLevel.isLoading}
        >
          Add level
        </Button>
      </div>

      {levels.map((level) => (
        <PersistLevelCard
          key={level.id}
          level={level}
          onRemove={() => removeLevel.mutate(level.id)}
          isRemoving={
            removeLevel.isLoading && removeLevel.variables === level.id
          }
        />
      ))}

      {levels.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No levels yet. Add levels for K-12 style intake generation.
        </p>
      )}
    </div>
  );
}

function PersistLevelCard({
  level,
  onRemove,
  isRemoving,
}: {
  level: PersistLevelRow;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const { data, refetch } = useQuery({
    queryKey: ["programLevelSections", level.id],
    queryFn: () =>
      searchEntities(
        "program-level-sections",
        { size: -1, sorts: ["sort_order", "name"] },
        {
          filter_params: [
            {
              field_name: "level",
              operator: operatorEnum.exact,
              value: String(level.id),
            },
          ],
        },
      ),
  });

  const sections = (data?.data?.data ?? []) as PersistSectionRow[];

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">{level.name}</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          isLoading={isRemoving}
        >
          Remove level
        </Button>
      </div>
      <PersistLevelSections
        levelId={String(level.id)}
        sections={sections}
        refetch={refetch}
      />
    </div>
  );
}

export function ProgramStructureEditor(props: ProgramStructureEditorProps) {
  if (props.mode === "draft") {
    return (
      <DraftStructureEditor value={props.value} onChange={props.onChange} />
    );
  }

  return <PersistStructureEditor programId={props.programId} />;
}

export function validateStructureDraft(levels: DraftLevel[]): string | null {
  if (levels.length === 0) {
    return "Add at least one level before continuing.";
  }

  for (const level of levels) {
    if (!level.name.trim()) {
      return "Each level must have a name.";
    }
    if (level.sections.length === 0) {
      return `Level "${level.name}" must have at least one section.`;
    }
    for (const section of level.sections) {
      if (!section.name.trim()) {
        return `Each section in "${level.name}" must have a name.`;
      }
    }
  }

  return null;
}
