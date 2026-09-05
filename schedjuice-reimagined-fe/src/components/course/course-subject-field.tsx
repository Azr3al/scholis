"use client";

import {
  makePostRequest,
  searchEntities,
} from "@/app/client-api/utils";
import EntityCombobox from "@/components/form/entity-combobox";
import { RequiredMark } from "@/components/form/required-mark";
import { EntityComboboxList as Combobox } from "@/components/form/entity-combobox-list";
import { Button } from "@/components/primitives";
import {
  Dialog,
} from "@/components/primitives";
import { Input } from "@/components/primitives";
import { Field } from "@/components/primitives";
import {
  createOrResolveSubjectByName,
  subjectCreateConfig,
} from "@/helpers/subject-create-config";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { cn } from "@/lib/utils";
import { operatorEnum, queryParamOptions } from "@/types/api";
import { SubjectStrategy } from "@/types/program";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "iconoir-react";
import { useId, useState } from "react";
import { useToast } from "@/components/primitives";

const SUBJECT_COMBO_QUERY_PARAMS: queryParamOptions = {
  fields: ["id", "name"],
  sorts: ["name"],
  size: -1,
};

type ProgramSubjectRow = {
  subject: { id: number; name: string } | number;
  is_active?: boolean;
  sort_order?: number;
};

function programSubjectsQueryKey(programId: number) {
  return ["programSubjectsForCourse", programId] as const;
}

function ProgramCatalogSubjectPicker({
  programId,
  value,
  onChange,
  label,
}: {
  programId: number;
  value: number | null | undefined;
  onChange: (subjectId: number | null) => void;
  label: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const createInputId = useId();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: programSubjectsQueryKey(programId),
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
              value: String(programId),
            },
            {
              field_name: "is_active",
              operator: operatorEnum.exact,
              value: "True",
            },
          ],
        },
      ),
    enabled: programId > 0,
  });

  const rows = (data?.data?.data ?? []) as ProgramSubjectRow[];
  const options = rows
    .filter((row) => row.is_active !== false)
    .map((row) => {
      const subjectId =
        typeof row.subject === "object" ? row.subject.id : row.subject;
      const name =
        typeof row.subject === "object" ? row.subject.name : `#${row.subject}`;
      return { value: String(subjectId), label: name };
    })
    .filter((opt) => opt.value && opt.label)
    .filter(
      (opt, index, all) =>
        all.findIndex((candidate) => candidate.value === opt.value) === index,
    );

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      const subjectId = await createOrResolveSubjectByName(trimmed);
      const alreadyInProgram = rows.some((row) => {
        const sid =
          typeof row.subject === "object" ? row.subject.id : row.subject;
        return sid === subjectId;
      });
      if (alreadyInProgram) {
        return { subjectId, linked: false as const };
      }
      await makePostRequest("program-subjects", {
        program: programId,
        subject: subjectId,
        sort_order: rows.length,
      });
      return { subjectId, linked: true as const };
    },
    onSuccess: async ({ subjectId, linked }) => {
      await refetch();
      await queryClient.invalidateQueries({
        queryKey: programSubjectsQueryKey(programId),
      });
      onChange(subjectId);
      setCreateOpen(false);
      setNewName("");
      toast.add({
        description: linked
          ? "Subject added to program."
          : "That subject is already linked to this program.",
      });
    },
    onError: (error: unknown) => {
      toast.add({
        description: parseSchedjuiceApiError(
          error,
          "Could not create subject.",
        ),
      });
    },
  });

  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3",
      )}
    >
      <div className="min-w-0 flex-1 w-full">
        <Combobox
          label={label}
          options={options}
          value={value ? String(value) : ""}
          setValue={(v) => onChange(v ? parseInt(v, 10) : null)}
          isLoading={isLoading}
          placeholder="Select subject"
          triggerClassName="w-full min-w-0"
          contentClassName="w-[var(--radix-popover-trigger-width)] min-w-[200px]"
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        className="h-8 shrink-0"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="mr-1 size-4" aria-hidden />
        {subjectCreateConfig.buttonLabel}
      </Button>
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup className="sm:max-w-md">
            <Dialog.Title>{subjectCreateConfig.dialogTitle}</Dialog.Title>
          <Field.Root className="space-y-2 py-2">
            <Field.Label htmlFor={createInputId}>
              {subjectCreateConfig.inputLabel}
            </Field.Label>
            <Input
              id={createInputId}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={subjectCreateConfig.inputPlaceholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const t = newName.trim();
                  if (t) createMutation.mutate(t);
                }
              }}
            />
          </Field.Root>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={createMutation.isPending}
              onClick={() => {
                const t = newName.trim();
                if (t) createMutation.mutate(t);
              }}
            >
              Create
            </Button>
          </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export function CourseSubjectField({
  programId,
  subjectStrategy,
  value,
  onChange,
  label = "Subject",
  isRequired = false,
  formDescription,
  error,
}: {
  programId: number;
  subjectStrategy: string | undefined;
  value: number | null | undefined;
  onChange: (subjectId: number | null) => void;
  label?: string;
  isRequired?: boolean;
  formDescription?: string;
  error?: string;
}) {
  const useProgramCatalog =
    subjectStrategy === SubjectStrategy.required && programId > 0;

  const description =
    formDescription ??
    (useProgramCatalog
      ? "Exam papers linked to this program. Add more in program settings."
      : undefined);

  return (
    <Field.Root className="space-y-2" invalid={Boolean(error)}>
      <Field.Label className={cn(error && "text-destructive")}>
        {label}
        {isRequired ? <RequiredMark /> : null}
      </Field.Label>
      {useProgramCatalog ? (
        <ProgramCatalogSubjectPicker
          programId={programId}
          value={value}
          onChange={onChange}
          label={label}
        />
      ) : (
        <EntityCombobox
          entity="subjects"
          queryParams={SUBJECT_COMBO_QUERY_PARAMS}
          displayFunction={(e) => e.name}
          value={String(value ?? "")}
          onChange={(v) => onChange(v ? parseInt(v, 10) : null)}
          label=""
          onCreateNew={subjectCreateConfig}
          comboboxPlaceholder="Select subject"
          containerClassName="[&>div>p]:hidden"
        />
      )}
      {description ? (
        <Field.Description>{description}</Field.Description>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : null}
    </Field.Root>
  );
}
