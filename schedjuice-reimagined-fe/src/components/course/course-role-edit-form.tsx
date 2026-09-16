"use client";

import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type * as z from "zod";

import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import AutoForm, {
  resolveAutoFormSchema,
  type AutoFormGroup,
  type AutoFormInputComponentProps,
} from "@/components/auto-form";
import { Checkbox, Field, useToast } from "@/components/primitives";
import { FieldLabelSuffix } from "@/components/form/required-mark";
import {
  scheduleScrollToFirstFormError,
  setFormErrrors,
} from "@/helpers/form";
import { queryClient } from "@/lib/query";
import { cn } from "@/lib/utils";
import { assignedAsRoleCreateSchema } from "@/types/course";

function SubstituteRoleCheckbox({
  label,
  isRequired,
  fieldConfigItem,
  fieldProps,
  error,
  className,
}: AutoFormInputComponentProps & { error?: string }) {
  const { value, onChange, name, ref } = fieldProps;
  return (
    <Field.Root
      className={cn(className, "flex-row items-start gap-3")}
      name={name}
      invalid={Boolean(error)}
    >
      <Checkbox
        ref={ref}
        name={name}
        checked={Boolean(value)}
        onCheckedChange={(checked) => {
          onChange(checked === true);
        }}
        className="mt-0.5 shrink-0 self-start"
      />
      <div className="flex flex-col gap-0.5">
        <Field.Label>
          {label}
          <FieldLabelSuffix required={isRequired} />
        </Field.Label>
        {fieldConfigItem.description ? (
          <Field.Description>{fieldConfigItem.description}</Field.Description>
        ) : null}
        <div className="min-h-5">
          {error ? <Field.Error>{error}</Field.Error> : null}
        </div>
      </div>
    </Field.Root>
  );
}

type CourseRoleEditFormProps = {
  roleId: string;
  substituteEnabled: boolean;
};

type CourseRoleFormValues = z.infer<typeof assignedAsRoleCreateSchema>;

function buildSavePayload(values: CourseRoleFormValues) {
  return {
    name: values.name,
    is_collision_enabled: values.is_collision_enabled,
    is_substitute: Boolean(values.is_substitute),
    seniority: values.seniority,
  };
}

export function CourseRoleEditForm({
  roleId,
  substituteEnabled,
}: CourseRoleEditFormProps) {
  const toast = useToast();
  const resolvedSchema = useMemo(
    () => resolveAutoFormSchema(assignedAsRoleCreateSchema),
    [],
  );

  const { data, isSuccess, isLoading } = useQuery({
    queryKey: ["getCourseRole", roleId],
    queryFn: () => fetchEntity("assigned-as-roles", roleId),
  });
  const entityData =
    isSuccess ? (data?.data?.data as CourseRoleFormValues | undefined) : undefined;

  const form = useForm<CourseRoleFormValues>({
    resolver: zodResolver(resolvedSchema),
    values: entityData,
  });

  const groups = useMemo((): AutoFormGroup[] => {
    if (substituteEnabled) {
      return [
        {
          id: "role-meta",
          title: "Role",
          description: "Name and system seniority for this course role.",
          fields: ["name", "seniority", "is_substitute"],
        },
        {
          id: "scheduling",
          title: "Scheduling",
          description: "Whether assignments with this role count toward collisions.",
          fields: ["is_collision_enabled"],
        },
      ];
    }
    return [
      {
        id: "role-meta",
        title: "Role",
        description: "Name and system seniority for this course role.",
        fields: ["name", "seniority"],
      },
      {
        id: "scheduling",
        title: "Scheduling",
        description: "Whether assignments with this role count toward collisions.",
        fields: ["is_collision_enabled"],
      },
    ];
  }, [substituteEnabled]);

  const updateMutation = useMutation({
    mutationKey: ["updateCourseRole", roleId],
    mutationFn: (payload: ReturnType<typeof buildSavePayload>) =>
      updateEntity("assigned-as-roles", roleId, payload),
    onError: (error) => {
      const applied = setFormErrrors(error, form);
      if (applied) scheduleScrollToFirstFormError(form);
      if (!applied) {
        toast.add({
          type: "error",
          description: "Failed to update course role",
        });
      }
    },
    onSuccess: () => {
      toast.add({ description: "course role updated successfully" });
      queryClient.invalidateQueries({
        queryKey: ["getCourseRole", roleId, "getAllcourse role"],
      });
    },
  });

  const fieldConfig = useMemo(
    () => ({
      seniority: {
        description: "Changing system role affects permissions.",
      },
      is_substitute: {
        description:
          "Substitute roles cover specific session dates instead of weekdays and can be removed automatically. Requires Main Teacher or Assistant Teacher seniority.",
        fieldType: SubstituteRoleCheckbox,
      },
      is_collision_enabled: {
        description:
          "If disabled, the course assignment will be ignored from event collision calculations.",
      },
    }),
    [],
  );

  return (
    <AutoForm
      schema={assignedAsRoleCreateSchema}
      saveMode="create"
      groups={groups}
      form={form}
      fieldConfig={fieldConfig}
      isLoading={isLoading}
      isSubmitting={updateMutation.isPending}
      submitLabel="Save"
      onSubmit={(values) => {
        updateMutation.mutate(
          buildSavePayload(values as CourseRoleFormValues),
        );
      }}
    />
  );
}
