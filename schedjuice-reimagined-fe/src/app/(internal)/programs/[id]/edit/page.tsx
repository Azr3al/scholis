"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import DeleteZone from "@/components/form/delete-zone";
import AutoForm, {
  AutoFormSkeleton,
  getDefaultValues,
  getObjectFormSchema,
  type AutoFormGroup,
} from "@/components/auto-form";
import { Button, buttonVariants } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
import { cn } from "@/lib/utils";
import {
  programCreateUpdateSchema,
  programToFormValues,
  programType,
} from "@/types/program";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { NavArrowLeft, Settings } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useUser } from "@/hooks/useUser";
import {
  appendActiveStatusGroup,
  canManageActiveStatus,
  highRiskFieldsWithActive,
} from "@/lib/form/field-visibility";

const BASE_HIGH_RISK_PROGRAM_FIELDS = [
  "course_creation_method",
  "subject_strategy",
] as const;

const programEditGroupsBase: AutoFormGroup[] = [
  {
    id: "identity",
    title: "Program",
    fields: ["name", "description"],
  },
  {
    id: "rules",
    title: "Creation rules",
    description: "Affects how courses and subjects are generated — save explicitly.",
    fields: ["course_creation_method", "subject_strategy"],
  },
];

const ProgramEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const canManageActive = canManageActiveStatus(user);
  const programEditGroups = useMemo(
    () => appendActiveStatusGroup(programEditGroupsBase, canManageActive),
    [canManageActive],
  );
  const highRiskProgramFields = useMemo(
    () => highRiskFieldsWithActive(BASE_HIGH_RISK_PROGRAM_FIELDS, canManageActive),
    [canManageActive],
  );
  const toast = useToast();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["getProgram", id],
    queryFn: () => fetchEntity("programs", id),
  });
  const program = data?.data?.data as programType | undefined;
  const objectFormSchema = getObjectFormSchema(programCreateUpdateSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(programCreateUpdateSchema),
    defaultValues: getDefaultValues(programCreateUpdateSchema),
    values: program ? programToFormValues(program) : undefined,
  });

  const updateProgram = useMutation({
    mutationKey: ["updateProgram", id],
    mutationFn: (payload: Partial<programType>) =>
      updateEntity("programs", id, payload),
    onError: (err) => {
      setFormErrrors(err, form);
      scheduleScrollToFirstFormError(form);
    },
    onSuccess: () => toast.add({ title: "Program updated" }),
  });

  const handleAutosave = useCallback(
    async (diff: Record<string, unknown>) => {
      try {
        return await updateEntity("programs", id, diff);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        throw e;
      }
    },
    [form, id],
  );

  const saveRules = useCallback(() => {
    const values = form.getValues();
    const payload: Record<string, unknown> = {};
    for (const key of highRiskProgramFields) {
      payload[key] = values[key];
    }
    updateProgram.mutate(payload as Partial<programType>);
  }, [form, highRiskProgramFields, updateProgram]);

  return (
    <PageContainer width="narrow" className="space-y-3">
      <div className="flex items-center gap-2">
        <Link
          href={`/programs/${id}`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm"  }),
            "size-9 p-0",
          )}
          aria-label="Back to program"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        </Link>
        <Link
          href={`/programs/${id}/settings`}
          className={cn(buttonVariants({ variant: "secondary", size: "sm"  }))}
        >
          <Settings className="mr-2 size-4" aria-hidden />
          Settings
        </Link>
      </div>
      {isLoading || isFetching || !program ? (
        <AutoFormSkeleton groups={programEditGroups} saveMode="edit" />
      ) : (
        <AutoForm
          form={form}
          schema={programCreateUpdateSchema}
          saveMode="edit"
          groups={programEditGroups}
          onAutosave={handleAutosave}
          autosaveQueryKey={["getProgram", id]}
          fieldConfig={{
            course_creation_method: { autosave: false },
            subject_strategy: { autosave: false },
            ...(canManageActive ? { is_active: { autosave: false } } : {}),
            // Hidden from UI — present on schema for round-trip only.
            intake_count: {
              renderParent: () => null,
            },
          }}
          shouldAutosaveField={(name) =>
            !highRiskProgramFields.includes(name) && name !== "intake_count"
          }
        >
          <div className="mt-6 flex min-h-10 items-center gap-3">
            <Button
              type="button"
              onClick={saveRules}
              isLoading={updateProgram.isLoading}
            >
              Save creation rules
            </Button>
          </div>
        </AutoForm>
      )}
      {program && !program.is_protected && (
        <DeleteZone
          validateInputKey="name"
          entityName="program"
          entityId={id}
          deleteApiUrl="programs"
        />
      )}
      {program?.is_protected && (
        <p className="text-sm text-text-secondary">
          This is a protected default program and cannot be deleted.
        </p>
      )}
    </PageContainer>
  );
};

export default ProgramEditPage;
