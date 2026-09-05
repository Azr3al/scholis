"use client";
import { Button, buttonVariants } from "@/components/primitives";

import {
  deleteEntity,
  makePostRequest,
  searchEntities,
} from "@/app/client-api/utils";
import { BulkAddSubjects } from "@/components/program/bulk-add-subjects";
import EntityCombobox from "@/components/form/entity-combobox";
import { subjectCreateConfig } from "@/helpers/subject-create-config";
import { operatorEnum } from "@/types/api";
import { SubjectStrategy } from "@/types/program";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash as Trash2 } from "iconoir-react";
import Link from "next/link";

type ProgramSubjectRow = {
  id: number;
  subject: { id: number; name: string } | number;
  sort_order?: number;
  is_active?: boolean;
};

export function ProgramSubjectsEditor({
  programId,
  subjectStrategy,
}: {
  programId: string;
  subjectStrategy: string;
}) {
  const qc = useQueryClient();
  const show =
    subjectStrategy === SubjectStrategy.required ||
    subjectStrategy === SubjectStrategy.multi;
  const pasteEnabled = subjectStrategy === SubjectStrategy.required;

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["programSubjects", programId],
    queryFn: () =>
      searchEntities(
        "program-subjects",
        { expand: ["subject"], size: -1, sorts: ["sort_order", "id"] },
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
    enabled: show,
  });

  const { data: orgData } = useQuery({
    queryKey: ["all-subjects-min"],
    queryFn: () =>
      searchEntities("subjects", { fields: ["id", "name"], size: -1 }, {}),
    enabled: show && pasteEnabled,
  });

  const rows = (data?.data?.data ?? []) as ProgramSubjectRow[];
  const orgSubjects = (
    (orgData?.data?.data ?? []) as { id: number; name: string }[]
  ).map((s) => ({ id: s.id, name: s.name }));

  const linkedSubjectIds = new Set<number>(
    rows
      .map((r) =>
        typeof r.subject === "object" ? r.subject.id : r.subject,
      )
      .filter((v): v is number => typeof v === "number"),
  );

  const addMutation = useMutation({
    mutationFn: (subjectId: number) =>
      makePostRequest("program-subjects", {
        program: parseInt(programId, 10),
        subject: subjectId,
        sort_order: rows.length,
      }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["programSubjects", programId] });
      qc.invalidateQueries({ queryKey: ["program-has-subjects", programId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteEntity("program-subjects", String(id)),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ["program-has-subjects", programId] });
    },
  });

  function handleCommitted() {
    refetch();
    qc.invalidateQueries({ queryKey: ["programSubjects", programId] });
    qc.invalidateQueries({ queryKey: ["program-has-subjects", programId] });
    qc.invalidateQueries({ queryKey: ["all-subjects-min"] });
  }

  if (!show) {
    return (
      <p className="text-sm text-muted-foreground">
        Subject catalog applies when subject strategy is Fixed subject list or
        K-12.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-l-2 border-primary/60 pl-3 text-sm text-muted-foreground max-w-[65ch]">
        Subjects are an org-wide list. This program&apos;s catalog picks which
        subjects apply; each intake then generates one class per subject.
        <span className="mt-1 flex flex-wrap items-center gap-1 font-mono text-xs">
          <span className="rounded bg-muted px-1.5 py-0.5">Subjects</span>
          <span aria-hidden>&gt;</span>
          <span className="rounded bg-muted px-1.5 py-0.5">Program catalog</span>
          <span aria-hidden>&gt;</span>
          <span className="rounded bg-muted px-1.5 py-0.5">
            one class per subject / intake
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-3 max-w-3xl">
        <EntityCombobox
          entity="subjects"
          displayFunction={(e) => e.name}
          value=""
          onChange={(v) => {
            if (v) addMutation.mutate(parseInt(v, 10));
          }}
          label="Add subject"
          comboboxPlaceholder="Choose subject"
          formDescription={
            <>
              Org-wide list · links only ·{" "}
              <Link
                href="/subjects"
                className="text-primary underline underline-offset-4 hover:no-underline"
              >
                All subjects
              </Link>
            </>
          }
          onCreateNew={subjectCreateConfig}
        />
        <BulkAddSubjects
          programId={programId}
          orgSubjects={orgSubjects}
          linkedSubjectIds={linkedSubjectIds}
          onCommitted={handleCommitted}
          enabled={pasteEnabled}
        />
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Subjects in this program</p>
        {isLoading ? (
          <ul className="divide-y rounded-md border">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-10 animate-pulse bg-muted/40" />
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No subjects yet — add one above, or paste a column.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((row) => {
              const name =
                typeof row.subject === "object"
                  ? row.subject.name
                  : `#${row.subject}`;
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span>{name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm" onClick={() => removeMutation.mutate(row.id)}
                    isLoading={
                      removeMutation.isLoading &&
                      removeMutation.variables === row.id
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
