"use client";
import { Button, buttonVariants, useToast } from "@/components/primitives";

import { makePostRequest, updateEntity } from "@/app/client-api/utils";
import { UserCreateFormSkeleton } from "@/components/users/user-create-form-skeleton";
import { AutosaveProvider } from "@/components/form/autosave-context";
import { AutosaveUnloadGuard } from "@/components/form/autosave-unload-guard";
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { invalidFieldsFromIssues } from "@/lib/autosave/autosave-core";
import {
  isMicrosoftLicenseBlocked,
  setFormErrrors,
  handleNativeFormInvalid,
  scheduleScrollToFirstFormError,
  scrollToFirstFormError,
} from "@/helpers/form";
import { isAdmin, isSuperAdmin } from "@/helpers/authorization";
import { hasStaffRole } from "@/helpers/role";
import { useTenant } from "@/hooks/useTenant";
import { useFormConfig } from "@/hooks/use-form-config";
import { buildConfigSchema } from "@/lib/custom-fields/build-config-schema";
import {
  buildFormSections,
  splitCreateFormSections,
  type FormSection,
} from "@/lib/custom-fields/build-form-sections";
import { GroupSection } from "@/components/custom-fields/group-section";
import { fieldFormPath, type FormActor } from "@/lib/custom-fields/field-policy";
import { EMPTY_FORM_CONFIG, type FormConfig } from "@/types/form-config";
import {
  accountCreateSchema,
  accountCreateSchemaObject,
  accountType,
  getUserSchema,
  publicProfileFragment,
  withStudentRoleExclusivity,
  role,
} from "@/types/user";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import { renderUserSectionFields } from "./user-form-fields";
import { UserFormSection } from "./user-form-section";
import {
  getUserFormCreateDefaults,
  hydrateUserForForm,
  pickIdentityFormValues,
  pickPublicProfileSavePayload,
  prepareUserFormPayload,
  PUBLIC_PROFILE_EXPLICIT_SAVE_KEYS,
  USER_CREATE_IDENTITY_KEYS,
} from "./user-form-utils";
import type { FieldMeasure } from "@/lib/ui/field-measure";
import { MicrosoftCreateToggle } from "@/components/microsoft/microsoft-create-toggle";

export interface UserFormProps {
  mode: "create" | "edit";
  viewerAccount: accountType;
  /** Required for edit; create mode fetches role-aware config internally. */
  formConfig?: FormConfig;
  actor: FormActor;
  subjectUser?: accountType;
  userId?: string;
  /** Default field container width for form sections. */
  measure?: FieldMeasure;
}

type CreateStep = 1 | 2;

function renderFormSectionList(
  sectionList: FormSection[],
  fieldsContext: Parameters<typeof renderUserSectionFields>[1],
  mode: "create" | "edit",
  actor: FormActor,
  form: ReturnType<typeof useForm<any>>,
  entityType?: string,
) {
  return sectionList.map((section, index) => {
    if (section.kind === "config") {
      return (
        <UserFormSection
          key={section.id}
          title={section.title}
          showSeparator={index > 0}
        >
          <GroupSection
            form={form}
            group={section.group}
            surface={mode}
            actor={actor}
            entityType={entityType}
          />
        </UserFormSection>
      );
    }

    const body = renderUserSectionFields(section.id, fieldsContext);
    if (!body) return null;
    return (
      <UserFormSection
        key={section.id}
        title={section.title}
        description={"description" in section ? section.description : undefined}
        showSeparator={index > 0}
      >
        {body}
      </UserFormSection>
    );
  });
}

export function UserForm({
  mode,
  viewerAccount,
  formConfig,
  actor,
  subjectUser,
  userId,
  measure,
}: UserFormProps) {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const formContainerRef = useRef<HTMLDivElement>(null);
  const preSubmitSyncRef = useRef<Set<() => void>>(new Set());
  const registerPreSubmit = useCallback((fn: () => void) => {
    preSubmitSyncRef.current.add(fn);
    return () => {
      preSubmitSyncRef.current.delete(fn);
    };
  }, []);
  const [createStep, setCreateStep] = useState<CreateStep>(1);
  const [createMicrosoftAccount, setCreateMicrosoftAccount] = useState(true);
  const [licenseBlocked, setLicenseBlocked] = useState(false);
  const pendingCreatePayloadRef = useRef<Record<string, unknown> | null>(null);
  const showMicrosoftToggle =
    mode === "create" &&
    Boolean(tenant?.is_microsoft_on) &&
    (isSuperAdmin(viewerAccount) || isAdmin(viewerAccount));

  const form = useForm<any>({
    defaultValues:
      mode === "create"
        ? getUserFormCreateDefaults()
        : subjectUser
          ? hydrateUserForForm(subjectUser, tenant)
          : {},
  });

  const watchedRoles: string[] = form.watch("roles") ?? [];

  const effectiveSubjectRoles = useMemo(() => {
    if (mode === "edit") {
      return watchedRoles.length > 0
        ? watchedRoles
        : ((subjectUser?.roles as string[] | undefined) ?? []);
    }
    return watchedRoles;
  }, [mode, watchedRoles, subjectUser?.roles]);

  const subjectIsStaff = hasStaffRole(effectiveSubjectRoles);
  const createConfigQuery = useFormConfig("create", watchedRoles, undefined, {
    enabled: mode === "create" && Boolean(tenant),
    keepPreviousData: true,
  });
  const effectiveConfig =
    mode === "create"
      ? (createConfigQuery.data ?? EMPTY_FORM_CONFIG)
      : (formConfig ?? EMPTY_FORM_CONFIG);

  const baseSchema = useMemo(() => {
    let schemaBase =
      mode === "create"
        ? accountCreateSchemaObject
        : getUserSchema(viewerAccount, tenant!);
    if (mode === "edit" && subjectIsStaff) {
      schemaBase = schemaBase.merge(publicProfileFragment);
    }
    return buildConfigSchema(schemaBase, effectiveConfig, mode);
  }, [viewerAccount, tenant, effectiveConfig, mode, subjectIsStaff]);
  const composedSchema = useMemo(
    () => withStudentRoleExclusivity(baseSchema),
    [baseSchema]
  );
  const identitySchema = accountCreateSchema;

  const availableKeys = useMemo(
    () => new Set(Object.keys(baseSchema.shape)),
    [baseSchema]
  );
  const sections = useMemo(
    () =>
      buildFormSections(effectiveConfig, {
        surface: mode,
        availableKeys,
        subjectIsStaff,
      }),
    [effectiveConfig, mode, availableKeys, subjectIsStaff]
  );
  const { identitySections, additionalSections } = useMemo(
    () => splitCreateFormSections(sections),
    [sections]
  );
  const configFieldPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const section of sections) {
      if (section.kind === "config") {
        for (const f of section.group.fields) paths.add(fieldFormPath(f));
      }
    }
    return paths;
  }, [sections]);
  const configFields = useMemo(
    () => effectiveConfig.groups.flatMap((g) => g.fields),
    [effectiveConfig]
  );
  const publicProfileAutosaveExcluded = useMemo(
    () => new Set<string>(PUBLIC_PROFILE_EXPLICIT_SAVE_KEYS),
    [],
  );
  const hasAdditionalStep =
    mode === "create" &&
    (additionalSections.length > 0 || showMicrosoftToggle);

  // Keep the resolver in sync with the latest schema (roles-driven on create).
  useEffect(() => {
    form.clearErrors();
  }, [composedSchema, form]);

  useEffect(() => {
    if (mode !== "create") return;
    setCreateStep(1);
  }, [mode, watchedRoles.join(",")]);

  const scrollToFirstError = useCallback(() => {
    scheduleScrollToFirstFormError(form, {
      root: formContainerRef.current ?? document,
    });
  }, [form]);

  useEffect(() => {
    if (mode !== "edit" || !subjectUser) return;
    const userData = hydrateUserForForm(subjectUser, tenant);
    form.reset(userData);
    form.setValue("gender", userData.gender);
  }, [mode, subjectUser, form, tenant]);

  const createMutation = useMutation({
    mutationKey: ["createUser"],
    mutationFn: (data: Record<string, unknown>) => makePostRequest("users", data),
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: "User created successfully.",
      });
      router.push("/users");
    },
    onError: (error) => {
      if (isMicrosoftLicenseBlocked(error)) setLicenseBlocked(true);
      const applied = setFormErrrors(error, form, (errorMsg: string) =>
        toast.add({ title: "Error!", description: errorMsg })
      );
      if (applied) scrollToFirstError();
    },
  });

  const editMutation = useMutation({
    mutationKey: [`updateUser${userId}`],
    mutationFn: (data: Record<string, unknown>) => updateEntity("users", userId!, data),
    onSuccess: () => {
      toast.add({
        title: "Success",
        description: "User updated successfully.",
      });
      router.push(`/users/${userId}`);
    },
    onError: (error) => {
      const applied = setFormErrrors(error, form);
      if (applied) scrollToFirstError();
      toast.add({
        title: "Error",
        description: "Failed to update user.",
      });
    },
  });

  const isSubmitting =
    mode === "create" ? createMutation.isLoading : editMutation.isLoading;

  const autosave = useAutosaveForm({
    form,
    queryKey: ["getUser", userId],
    enabled: mode === "edit",
    shouldAutosaveField: (name) =>
      !configFieldPaths.has(name) && !publicProfileAutosaveExcluded.has(name),
    validateFields: async (fields) => {
      const parsed = composedSchema.safeParse(form.getValues());
      if (parsed.success) return [];
      const fieldSet = new Set(fields);
      const relevant = parsed.error.issues.filter((i) =>
        fieldSet.has(String(i.path[0]))
      );
      for (const issue of relevant) {
        form.setError(issue.path.join(".") as never, { message: issue.message });
      }
      return invalidFieldsFromIssues(relevant, fields);
    },
    buildPayload: (fields, values) => {
      const normalized = prepareUserFormPayload(values, {
        mode: "edit",
        tenant,
        fields: configFields,
      });
      const out: Record<string, unknown> = {};
      for (const f of fields) out[f] = (normalized as Record<string, unknown>)[f];
      return out;
    },
    save: async (payload) => {
      try {
        return await updateEntity("users", userId!, payload);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scrollToFirstError();
        toast.add({
          title: "Error",
          description: "Failed to save changes.",
        });
        throw e;
      }
    },
  });

  const saveCustomFields = useCallback(() => {
    const normalized = prepareUserFormPayload(form.getValues(), {
      mode: "edit",
      tenant,
      fields: configFields,
    });
    editMutation.mutate({ custom_data: normalized.custom_data });
  }, [configFields, editMutation, form, tenant]);

  const savePublicProfileMutation = useMutation({
    mutationKey: [`savePublicProfile${userId}`],
    mutationFn: (payload: Record<string, unknown>) =>
      updateEntity("users", userId!, payload),
    onSuccess: (response) => {
      toast.add({
        title: "Success",
        description: "Public profile saved.",
      });
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
      void queryClient.invalidateQueries({ queryKey: ["getUser", userId] });
    },
    onError: (error) => {
      const applied = setFormErrrors(error, form);
      if (applied) scrollToFirstError();
      toast.add({
        title: "Error",
        description: "Failed to save public profile.",
      });
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
      scrollToFirstError();
      return;
    }
    const normalized = prepareUserFormPayload(formData, {
      mode: "edit",
      tenant,
      fields: configFields,
    });
    savePublicProfileMutation.mutate(pickPublicProfileSavePayload(normalized));
  }, [
    configFields,
    form,
    savePublicProfileMutation,
    scrollToFirstError,
    tenant,
  ]);

  const fieldsContext = {
    form,
    mode,
    viewerAccount,
    measure,
    subjectUser: mode === "edit" ? subjectUser : undefined,
    tenant,
    myanmarAddress: { region: "", city: "", township: "" },
    registerPreSubmit,
    ...(mode === "edit"
      ? {
          commitField: autosave.commitField,
        }
      : {}),
    ...(mode === "edit" && subjectIsStaff
      ? {
          savePublicProfile,
          isSavingPublicProfile: savePublicProfileMutation.isPending,
        }
      : {}),
  };

  const applyValidationErrors = useCallback(
    (
      issues: { path: (string | number)[]; message: string }[],
      options?: { onCreateStep2?: boolean }
    ) => {
      form.clearErrors();
      const errorKeys: string[] = [];
      for (const issue of issues) {
        const key = issue.path.join(".");
        errorKeys.push(key);
        form.setError(key as never, { message: issue.message });
      }

      const resolveErrors = () => {
        const root = formContainerRef.current ?? document;
        const scrolled = scrollToFirstFormError(form, { root });
        if (scrolled || !options?.onCreateStep2) return;

        const hasIdentityError = errorKeys.some(
          (key) =>
            key === "roles" ||
            (USER_CREATE_IDENTITY_KEYS as readonly string[]).includes(key)
        );
        if (hasIdentityError) {
          setCreateStep(1);
          requestAnimationFrame(() => {
            scrollToFirstFormError(form, {
              root: formContainerRef.current ?? document,
            });
          });
          return;
        }

        const firstMsg =
          issues[0]?.message ??
          "Some required fields need attention on the previous step.";
        form.setError("root" as never, { message: firstMsg });
        toast.add({
          title: "Validation error",
          description: firstMsg});
      };

      requestAnimationFrame(resolveErrors);
    },
    [form, toast]
  );

  const ensureRolesSelected = useCallback(
    (roles: unknown) => {
      if (!Array.isArray(roles) || roles.length === 0) {
        form.setError("roles", { message: "Choose at least one role" });
        scrollToFirstError();
        return false;
      }
      return true;
    },
    [form, scrollToFirstError]
  );

  const submitCreatePayload = useCallback(
    (
      validated: Record<string, unknown>,
      options?: { includeMicrosoft?: boolean }
    ) => {
      const payload = prepareUserFormPayload(validated, {
        mode: "create",
        tenant,
        fields: configFields,
      });
      if (options?.includeMicrosoft && showMicrosoftToggle) {
        payload.create_microsoft_account = createMicrosoftAccount;
      }
      pendingCreatePayloadRef.current = payload;
      setLicenseBlocked(false);
      createMutation.mutate(payload);
    },
    [createMicrosoftAccount, createMutation, configFields, showMicrosoftToggle, tenant]
  );

  const validateIdentityStep = useCallback(
    (data: Record<string, unknown>) => {
      const identityData = pickIdentityFormValues(data);
      const parsed = identitySchema.safeParse(identityData);
      if (!parsed.success) {
        applyValidationErrors(parsed.error.issues);
        return null;
      }
      const validated = parsed.data as Record<string, unknown>;
      if (!ensureRolesSelected(validated.roles)) return null;
      return validated;
    },
    [applyValidationErrors, ensureRolesSelected, identitySchema]
  );

  const handleContinueToAdditionalStep = useCallback(() => {
    const validated = validateIdentityStep(form.getValues());
    if (!validated) return;
    setCreateStep(2);
  }, [form, validateIdentityStep]);

  const handleSkipAdditionalStep = useCallback(() => {
    const validated = validateIdentityStep(form.getValues());
    if (!validated) return;
    submitCreatePayload(validated, { includeMicrosoft: false });
  }, [form, submitCreatePayload, validateIdentityStep]);

  const onSubmit = async (data: Record<string, unknown>) => {
    if (mode === "edit") {
      preSubmitSyncRef.current.forEach((sync) => sync());
      const formData = form.getValues();
      const parsed = composedSchema.safeParse(formData);
      if (!parsed.success) {
        applyValidationErrors(parsed.error.issues);
        return;
      }
      editMutation.mutate(
        prepareUserFormPayload(parsed.data as Record<string, unknown>, {
          mode: "edit",
          tenant,
          fields: configFields,
        })
      );
      return;
    }

    // Create: step one with no additional step submits identity only.
    if (createStep === 1 && !hasAdditionalStep) {
      const validated = validateIdentityStep(data);
      if (!validated) return;
      submitCreatePayload(validated, { includeMicrosoft: false });
      return;
    }

    // Create: step two full submit (identity + additional fields).
    if (createStep === 2) {
      const parsed = composedSchema.safeParse(data);
      if (!parsed.success) {
        applyValidationErrors(parsed.error.issues, { onCreateStep2: true });
        return;
      }
      const validated = parsed.data as Record<string, unknown>;
      if (!ensureRolesSelected(validated.roles)) return;
      submitCreatePayload(validated, { includeMicrosoft: true });
    }
  };

  const cancelHref = mode === "create" ? "/users" : `/users/${userId}`;

  const visibleSections =
    mode === "create"
      ? createStep === 1
        ? identitySections
        : additionalSections
      : sections;

  if (mode === "create" && createConfigQuery.isLoading && !createConfigQuery.data) {
    return <UserCreateFormSkeleton />;
  }

  const formBody = (
    <div ref={formContainerRef} className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      {mode === "edit" ? <AutosaveUnloadGuard status={autosave.status} /> : null}
      {mode === "create" && hasAdditionalStep ? (
        <p className="mb-6 text-sm text-text-muted" aria-live="polite">
          Step {createStep} of 2
          {createStep === 2 ? ": additional details (optional)" : ": profile and access"}
        </p>
      ) : null}
      <FormProvider {...form}>
        <form
          className="space-y-8 pb-8"
          onBlurCapture={(e) => {
            if (mode !== "edit") return;
            const name = (e.target as HTMLElement).getAttribute("name");
            if (name) autosave.bindField(name).onBlur();
          }}
          onSubmit={form.handleSubmit(onSubmit, () => scrollToFirstError())}
          onInvalidCapture={handleNativeFormInvalid}
        >
          {form.formState.errors.root ? (
            <div
              data-form-root-error
              className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive space-y-3"
              role="alert"
            >
              <p>{String(form.formState.errors.root.message)}</p>
              {licenseBlocked && showMicrosoftToggle && createMicrosoftAccount ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  isLoading={createMutation.isLoading}
                  onClick={() => {
                    const base = pendingCreatePayloadRef.current;
                    if (!base) return;
                    createMutation.mutate({
                      ...base,
                      allow_unlicensed_microsoft_account: true,
                    });
                  }}
                >
                  Create anyway (without license)
                </Button>
              ) : null}
            </div>
          ) : null}

          {renderFormSectionList(
            visibleSections,
            fieldsContext,
            mode,
            actor,
            form,
            effectiveConfig.entityType,
          )}

          {mode === "create" && createStep === 2 && showMicrosoftToggle ? (
            <MicrosoftCreateToggle
              checked={createMicrosoftAccount}
              onChange={setCreateMicrosoftAccount}
              title="Create Microsoft account"
              description="Also provision a Microsoft account for this person. Turn off to create only the local record; you can provision it later from their profile."
            />
          ) : null}

          {mode === "create" ? (
            <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:flex-wrap sm:items-center">
              {createStep === 1 && hasAdditionalStep ? (
                <>
                  <Button
                    type="button"
                    className="sm:min-w-36"
                    onClick={handleContinueToAdditionalStep}
                  >
                    Continue
                  </Button>
                  <Link
                    href={cancelHref}
                    className={cn(buttonVariants({ variant: "secondary" }), "sm:min-w-36")}
                  >
                    Cancel
                  </Link>
                </>
              ) : null}

              {createStep === 1 && !hasAdditionalStep ? (
                <>
                  <Button type="submit" isLoading={isSubmitting}>
                    Add person
                  </Button>
                  <Link
                    href={cancelHref}
                    aria-disabled={isSubmitting}
                    className={cn(
                      buttonVariants({ variant: "secondary" }),
                      "sm:min-w-36",
                      isSubmitting && "pointer-events-none opacity-50"
                    )}
                  >
                    Cancel
                  </Link>
                </>
              ) : null}

              {createStep === 2 ? (
                <>
                  <Button type="submit" isLoading={isSubmitting}>
                    Add person
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="sm:min-w-36"
                    isLoading={isSubmitting}
                    onClick={handleSkipAdditionalStep}
                  >
                    Skip and add person
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isSubmitting}
                    onClick={() => setCreateStep(1)}
                  >
                    Back
                  </Button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center">
              {configFieldPaths.size > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={saveCustomFields}
                  isLoading={editMutation.isLoading}
                  className="sm:min-w-36"
                >
                  Save custom fields
                </Button>
              ) : null}
              <Link
                href={cancelHref}
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "sm:min-w-36"
                )}
              >
                Cancel
              </Link>
            </div>
          )}
        </form>
      </FormProvider>
    </div>
  );

  if (mode === "edit") {
    return <AutosaveProvider value={autosave}>{formBody}</AutosaveProvider>;
  }

  return formBody;
}
