"use client";
import { Button, useToast } from "@/components/primitives";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EditPencil } from "iconoir-react";
import { RecordSection } from "@/components/record/record-section";
import { GroupSection } from "@/components/custom-fields/group-section";
import { FormConfigDetail } from "@/components/custom-fields/form-config-detail";
import { buildConfigSchema } from "@/lib/custom-fields/build-config-schema";
import { collectGroupPayload } from "@/lib/custom-fields/completion";
import type { FormActor } from "@/lib/custom-fields/field-policy";
import { updateEntity } from "@/app/client-api/utils";
import { hydrateUserForForm, prepareUserFormPayload } from "@/components/users/user-form-utils";
import { getUserSchema } from "@/types/user";
import type { FormConfig, FormConfigGroup } from "@/types/form-config";
import type { accountType } from "@/types/user";
import type { organizationType } from "@/types/organization";
import { mergeUserRecordCache } from "@/lib/user/merge-user-record-cache";
import { cn } from "@/lib/utils";

export function InlineGroup({
  group,
  subject,
  viewer,
  tenant,
  actor,
  recordQueryKey,
  redactedKeys,
  canEdit,
}: {
  group: FormConfigGroup;
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  actor: FormActor;
  recordQueryKey: unknown[];
  redactedKeys: string[];
  canEdit: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const singleGroupConfig: FormConfig = useMemo(
    () =>
      ({
        entityType: "app_auth.User",
        surface: "edit",
        groups: [group],
      }) as FormConfig,
    [group],
  );

  const defaultValues = useMemo(
    () => hydrateUserForForm(subject, tenant),
    [subject, tenant],
  );

  const schema = useMemo(() => {
    const base = getUserSchema(viewer, tenant ?? undefined);
    return buildConfigSchema(base, singleGroupConfig, "edit");
  }, [viewer, tenant, singleGroupConfig]);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur",
  });

  useEffect(() => {
    if (!editing) form.reset(defaultValues);
  }, [defaultValues, editing, form]);

  const save = useMutation({
    mutationFn: async () => {
      const normalized = prepareUserFormPayload(form.getValues() as Record<string, unknown>, {
        mode: "edit",
        tenant,
        fields: group.fields,
      });
      return updateEntity(
        "users",
        String(subject.id),
        collectGroupPayload(group.fields, normalized),
      );
    },
    onSuccess: (response) => {
      const updated = response?.data?.data as Record<string, unknown> | undefined;
      qc.setQueryData(recordQueryKey, (prev) =>
        mergeUserRecordCache(
          prev as Parameters<typeof mergeUserRecordCache>[0],
          updated,
        ),
      );
      void qc.invalidateQueries({ queryKey: recordQueryKey });
      toast.add({ title: `${group.name} saved` });
      setEditing(false);
    },
    onError: () =>
      toast.add({ title: `Could not save ${group.name}` }),
  });

  const editAction = canEdit ? (
    <button
      type="button"
      onClick={() => {
        form.reset(defaultValues);
        setEditing(true);
      }}
      className="flex shrink-0 items-center gap-1 text-xs text-text-muted hover:text-text-primary"
    >
      <EditPencil width={13} height={13} aria-hidden /> Edit
    </button>
  ) : null;

  if (!editing) {
    return (
      <RecordSection title={group.name} action={editAction}>
        <FormConfigDetail
          config={singleGroupConfig}
          source={subject as unknown as Record<string, unknown>}
          isLoading={false}
          redactedKeys={redactedKeys}
          embedded
        />
      </RecordSection>
    );
  }

  return (
    <RecordSection title={group.name}>
      <div className="rounded-lg bg-surface-sunken/40 p-4">
        <FormProvider {...form}>
          <form
            onSubmit={form.handleSubmit(() => save.mutate())}
            className={cn("flex flex-col gap-4")}
          >
            <GroupSection form={form} group={group} surface="edit" actor={actor} />
            <div className="flex gap-2">
              <Button size="sm" type="submit" isLoading={save.isPending}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </FormProvider>
      </div>
    </RecordSection>
  );
}
