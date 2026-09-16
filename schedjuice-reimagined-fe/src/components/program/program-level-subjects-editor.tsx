"use client";

import {
  deleteEntity,
  makePostRequest,
  searchEntities,
} from "@/app/client-api/utils";
import EntityCombobox from "@/components/form/entity-combobox";
import { operatorEnum } from "@/types/api";
import { SubjectStrategy } from "@/types/program";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type LevelRow = { id: number; name: string };
type LevelSubjectRow = {
  id: number;
  subject: { id: number; name: string } | number;
};

export function LevelSubjectsForProgram({ programId }: { programId: string }) {
  const qc = useQueryClient();

  const { data: levelsData, refetch: refetchLevels } = useQuery({
    queryKey: ["programLevelsForSubjects", programId],
    queryFn: () =>
      searchEntities(
        "program-levels",
        { size: -1, sorts: ["sort_order", "name"] },
        {
          filter_params: [
            { field_name: "program", operator: operatorEnum.exact, value: programId },
          ],
        },
      ),
  });

  const levels = (levelsData?.data?.data ?? []) as LevelRow[];

  const addMutation = useMutation({
    mutationFn: ({
      levelId,
      subjectId,
      sortOrder,
    }: {
      levelId: number;
      subjectId: number;
      sortOrder: number;
    }) =>
      makePostRequest("program-level-subjects", {
        level: levelId,
        subject: subjectId,
        sort_order: sortOrder,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programLevelSubjects"] });
      refetchLevels();
    },
  });

  if (levels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add levels above, then assign subjects per level.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {levels.map((level) => (
        <LevelSubjectEditor
          key={level.id}
          level={level}
          onAdd={(subjectId, sortOrder) =>
            addMutation.mutate({ levelId: level.id, subjectId, sortOrder })
          }
        />
      ))}
    </div>
  );
}

function LevelSubjectEditor({
  level,
  onAdd,
}: {
  level: LevelRow;
  onAdd: (subjectId: number, sortOrder: number) => void;
}) {
  const { data, refetch } = useQuery({
    queryKey: ["programLevelSubjects", level.id],
    queryFn: () =>
      searchEntities(
        "program-level-subjects",
        { expand: ["subject"], size: -1 },
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

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteEntity("program-level-subjects", String(id)),
    onSuccess: () => refetch(),
  });

  const rows = (data?.data?.data ?? []) as LevelSubjectRow[];

  return (
    <div className="rounded-md border px-3 py-2 space-y-2">
      <p className="text-sm font-medium">{level.name}</p>
      <ul className="flex flex-wrap gap-2">
        {rows.map((row) => {
          const name =
            typeof row.subject === "object" ? row.subject.name : `#${row.subject}`;
          return (
            <li
              key={row.id}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
            >
              {name}
              <button
                type="button"
                className="text-muted-foreground"
                onClick={() => removeMutation.mutate(row.id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <EntityCombobox
        entity="subjects"
        displayFunction={(e) => e.name}
        value=""
        onChange={(v) => {
          if (v) onAdd(parseInt(v, 10), rows.length);
        }}
        label={`Add subject to ${level.name}`}
      />
    </div>
  );
}

export function ProgramLevelSubjectsPanel({
  programId,
  subjectStrategy,
}: {
  programId: string;
  subjectStrategy: string;
}) {
  if (subjectStrategy !== SubjectStrategy.multi) {
    return (
      <p className="text-sm text-muted-foreground">
        Per-level subjects apply when subject strategy is Multi per course.
      </p>
    );
  }

  return <LevelSubjectsForProgram programId={programId} />;
}
