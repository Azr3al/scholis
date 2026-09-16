"use client";
import { useToast } from "@/components/primitives";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RecordSection } from "@/components/record/record-section";
import { UserPublicProfileFields } from "@/components/users/user-public-profile-fields";
import { updateEntity } from "@/app/client-api/utils";
import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
import {
  hydrateUserForForm,
  pickPublicProfileSavePayload,
  prepareUserFormPayload,
  PUBLIC_PROFILE_EXPLICIT_SAVE_KEYS,
} from "@/components/users/user-form-utils";
import { buildConfigSchema } from "@/lib/custom-fields/build-config-schema";
import { EMPTY_FORM_CONFIG } from "@/types/form-config";
import {
  getUserSchema,
  publicProfileFragment,
  type accountType,
} from "@/types/user";
import type { FormConfigField } from "@/types/form-config";
import type { organizationType } from "@/types/organization";
import { canEditUser } from "@/helpers/authorization";

export function RecordPublicProfile({
  subject,
  viewer,
  tenant,
  recordQueryKey,
  configFields,
}: {
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  recordQueryKey: unknown[];
  configFields: FormConfigField[];
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const preSubmitSyncRef = useRef<Set<() => void>>(new Set());

  const defaultValues = useMemo(
    () => hydrateUserForForm(subject, tenant),
    [subject, tenant],
  );

  const schema = useMemo(() => {
    const base = getUserSchema(viewer, tenant ?? undefined).merge(publicProfileFragment);
    return buildConfigSchema(base, EMPTY_FORM_CONFIG, "edit");
  }, [viewer, tenant]);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur",
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const registerPreSubmit = useCallback((fn: () => void) => {
    preSubmitSyncRef.current.add(fn);
    return () => {
      preSubmitSyncRef.current.delete(fn);
    };
  }, []);

  const savePublicProfileMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      updateEntity("users", String(subject.id), payload),
    onSuccess: (response) => {
      toast.add({ title: "Public profile saved" });
      const updated = response?.data?.data as Record<string, unknown> | undefined;
      const values = form.getValues();
      for (const key of PUBLIC_PROFILE_EXPLICIT_SAVE_KEYS) {
        form.resetField(key, { defaultValue: values[key] });
      }
      if (updated?.public_profile_slug != null) {
        form.setValue("public_profile_slug", updated.public_profile_slug, {
          shouldDirty: false,
        });
      }
      qc.invalidateQueries({ queryKey: recordQueryKey });
    },
    onError: (error) => {
      const applied = setFormErrrors(error, form);
      if (applied) scheduleScrollToFirstFormError(form);
      toast.add({ title: "Could not save public profile" });
    },
  });

  const savePublicProfile = useCallback(() => {
    preSubmitSyncRef.current.forEach((sync) => sync());
    const formData = form.getValues();
    const parsed = publicProfileFragment.safeParse(formData);
    if (!parsed.success) {
      form.clearErrors();
      for (const issue of parsed.error.issues) {
        form.setError(issue.path.join(".") as never, { message: issue.message });
      }
      scheduleScrollToFirstFormError(form);
      return;
    }
    const normalized = prepareUserFormPayload(formData as Record<string, unknown>, {
      mode: "edit",
      tenant,
      fields: configFields,
    });
    savePublicProfileMutation.mutate(pickPublicProfileSavePayload(normalized));
  }, [configFields, form, savePublicProfileMutation, tenant]);

  if (!canEditUser(viewer, subject.id)) return null;

  return (
    <RecordSection title="Public profile">
      <FormProvider {...form}>
        <UserPublicProfileFields
          form={form}
          mode="edit"
          viewerAccount={viewer}
          subjectUser={subject}
          tenant={tenant}
          myanmarAddress={{ region: "", city: "", township: "" }}
          registerPreSubmit={registerPreSubmit}
          savePublicProfile={savePublicProfile}
          isSavingPublicProfile={savePublicProfileMutation.isPending}
        />
      </FormProvider>
    </RecordSection>
  );
}
