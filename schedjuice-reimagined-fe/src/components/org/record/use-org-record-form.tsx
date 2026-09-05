"use client";

import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import {
  getObjectFormSchema,
  type AutoFormInputComponentProps,
  type FieldConfigItem,
} from "@/components/auto-form";
import { Field, Input, Switch, useToast } from "@/components/primitives";
import { ApprovedDomainsEditor } from "@/components/organization/approved-domains-editor";
import { StudentDmContactPicker } from "@/components/org/record/student-dm-contact-picker";
import TimezoneSelector from "@/components/form/selectors/timezone-selector";
import {
  buildCombinedOrgFormData,
  buildOrgSectionFormData,
  pickOrgSectionValues,
  validateOrgSectionsForSave,
} from "@/lib/org/build-org-section-payload";
import { getDirtySchemaSectionIds } from "@/lib/org/org-dirty-sections";
import { orgBooleanSwitchDefaults } from "@/lib/org/org-field-config";
import {
  validateMicrosoftOwnerSetup,
  validateTelegramOwnerSetup,
} from "@/helpers/organization-profile-submit";
import { getOrgSchemaSectionMeta, getOrgSchemaSectionKeys } from "@/config/organization-profile-sections";
import { ORG_SETTING_HELP } from "@/config/org-setting-help-copy";
import { OrgSettingHelp } from "@/components/org/org-setting-help";
import {
  ORGANIZATION_MS_WRITE_ONLY_FIELD_KEYS,
  ORGANIZATION_TELEGRAM_WRITE_ONLY_FIELD_KEYS,
  organizationOwnerEditSchema,
  organizationType,
  ConsultationStrategy,
  VideoConferencingPlatform,
} from "@/types/organization";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef } from "react";
import { useForm, useFormState, type UseFormReturn } from "react-hook-form";
import * as z from "zod";

export type OrgRecordFormRefs = {
  wasMicrosoftOnAtLoadRef: React.MutableRefObject<boolean>;
  wasTelegramOnAtLoadRef: React.MutableRefObject<boolean>;
  hadTelegramBotAtLoadRef: React.MutableRefObject<boolean>;
};

export function useOrgRecordForm({
  orgId,
  tenantOrg,
  refetchTenant,
  onSectionSaveSuccess,
}: {
  orgId: string | number | undefined;
  tenantOrg: organizationType | null | undefined;
  refetchTenant: () => void;
  onSectionSaveSuccess?: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const wasMicrosoftOnAtLoadRef = useRef(false);
  const wasTelegramOnAtLoadRef = useRef(false);
  const hadTelegramBotAtLoadRef = useRef(false);

  const orgQuery = useQuery({
    queryKey: ["getOrganization", orgId],
    queryFn: () => fetchEntity("organizations", orgId!),
    enabled: orgId != null,
  });

  const objectFormSchema = getObjectFormSchema(organizationOwnerEditSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(objectFormSchema),
    defaultValues: {},
  });

  form.watch([
    "timezone",
    "is_microsoft_on",
    "is_teams_creation_enabled",
    "is_teams_attendance_sync_enabled",
    "video_conferencing_platform",
    "is_telegram_on",
    "is_telegram_login_on",
    "is_google_on",
    "is_google_login_on",
    "is_consultation_booking_on",
    "is_crm_enabled",
    "is_library_disabled",
    "is_students_dm_admins_only_enabled",
  ]);

  const isMicrosoftOn = form.watch("is_microsoft_on");
  const isTelegramOn = form.watch("is_telegram_on");
  const isGoogleOn = form.watch("is_google_on");
  const isConsultationOn = form.watch("is_consultation_booking_on");
  const isCrmEnabled = form.watch("is_crm_enabled");
  const isLibraryDisabled = form.watch("is_library_disabled");
  const isStudentsDmAdminsOnly = form.watch("is_students_dm_admins_only_enabled");
  const prevStudentsDmAdminsOnlyRef = useRef(isStudentsDmAdminsOnly);

  useEffect(() => {
    if (prevStudentsDmAdminsOnlyRef.current && !isStudentsDmAdminsOnly) {
      form.setValue("student_dm_contact_user_id", null, { shouldDirty: true });
    }
    prevStudentsDmAdminsOnlyRef.current = isStudentsDmAdminsOnly;
  }, [form, isStudentsDmAdminsOnly]);

  const orgRecord = (orgQuery.data?.data.data ?? tenantOrg) as
    | organizationType
    | undefined;

  useEffect(() => {
    if (orgQuery.data && orgQuery.isSuccess) {
      const orgData = orgQuery.data.data.data as Record<string, unknown>;
      wasMicrosoftOnAtLoadRef.current = Boolean(orgData.is_microsoft_on);
      wasTelegramOnAtLoadRef.current = Boolean(orgData.is_telegram_on);
      hadTelegramBotAtLoadRef.current = Boolean(orgData.telegram_bot_username);
      const writeOnly = new Set<string>([
        ...ORGANIZATION_MS_WRITE_ONLY_FIELD_KEYS,
        ...ORGANIZATION_TELEGRAM_WRITE_ONLY_FIELD_KEYS,
      ]);
      Object.keys(orgData).forEach((k) => {
        if (writeOnly.has(k)) return;
        const value = orgData[k];
        if (
          k === "id_card_org_name" ||
          k === "id_card_staff_accent" ||
          k === "id_card_student_accent"
        ) {
          form.setValue(k, value ?? "");
          return;
        }
        form.setValue(k, value);
      });
      if (orgData.is_teams_creation_enabled === undefined) {
        form.setValue(
          "is_teams_creation_enabled",
          Boolean(orgData.is_microsoft_on),
        );
      }
    }
  }, [orgQuery.data, orgQuery.isSuccess, form]);

  useEffect(() => {
    if (!isMicrosoftOn) {
      form.setValue("is_teams_creation_enabled", false);
      form.setValue("is_teams_attendance_sync_enabled", false);
      return;
    }
    const platform = form.getValues("video_conferencing_platform");
    if (platform == null || platform === "") {
      form.setValue(
        "video_conferencing_platform",
        VideoConferencingPlatform.microsoft_teams,
      );
    }
    if (form.getValues("is_teams_creation_enabled") === undefined) {
      form.setValue("is_teams_creation_enabled", true);
    }
  }, [isMicrosoftOn, form]);

  useEffect(() => {
    if (!isTelegramOn) {
      form.setValue("is_telegram_roster_sync_enabled", false);
    } else if (
      form.getValues("is_telegram_roster_sync_enabled") === undefined
    ) {
      form.setValue("is_telegram_roster_sync_enabled", true);
    }
  }, [isTelegramOn, form]);

  useEffect(() => {
    if (!isGoogleOn) {
      form.setValue("is_google_login_on", false);
    }
  }, [isGoogleOn, form]);

  const { dirtyFields } = useFormState({ control: form.control });

  const updateOrganization = useMutation({
    mutationFn: ({
      sectionIds,
      formData,
    }: {
      sectionIds: string[];
      formData: FormData;
    }) => updateEntity("organizations", orgId!, formData),
    onSuccess: (_data, variables) => {
      const count = variables.sectionIds.length;
      const title =
        count === 1
          ? (getOrgSchemaSectionMeta(variables.sectionIds[0]!)?.title ??
            "Settings")
          : `${count} sections`;
      toast.add({ description: `${title} saved.` });
      void orgQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["getOrganization", orgId] });
      if (
        tenantOrg?.id != null &&
        String(tenantOrg.id) === String(orgId)
      ) {
        refetchTenant();
      }
      const resetKeys = new Set<string>();
      for (const sectionId of variables.sectionIds) {
        for (const key of Object.keys(
          pickOrgSectionValues(sectionId, form.getValues()),
        )) {
          resetKeys.add(key);
        }
      }
      resetKeys.forEach((key) => {
        form.resetField(String(key), {
          defaultValue: form.getValues(String(key)),
        });
      });
      onSectionSaveSuccess?.();
    },
    onError: () => {
      toast.add({
        title: "Error",
        description: "Failed to save settings.",
      });
    },
  });

  const fieldConfig = useOrgFieldConfig({
    orgId,
    form,
    isMicrosoftOn,
    isTelegramOn,
    isGoogleOn,
    isConsultationOn,
    isCrmEnabled,
    isLibraryDisabled,
    isStudentsDmAdminsOnly,
    refs: {
      wasMicrosoftOnAtLoadRef,
      wasTelegramOnAtLoadRef,
      hadTelegramBotAtLoadRef,
    },
  });

  const saveSection = (
    sectionId: string,
    opts?: { idCardLogoCleared?: boolean },
  ) => {
    const data = form.getValues();
    if (sectionId === "microsoft") {
      const payload: Record<string, unknown> = {
        ...pickOrgSectionValues(sectionId, data),
      };
      const validationError = validateMicrosoftOwnerSetup(payload, {
        wasMicrosoftOnAtLoad: wasMicrosoftOnAtLoadRef.current,
      });
      if (validationError) {
        toast.add({ description: validationError });
        return;
      }
    }
    if (sectionId === "telegram") {
      const payload: Record<string, unknown> = {
        ...pickOrgSectionValues(sectionId, data),
      };
      const telegramError = validateTelegramOwnerSetup(payload, {
        wasTelegramOnAtLoad: wasTelegramOnAtLoadRef.current,
        hasConnectedBot: hadTelegramBotAtLoadRef.current,
      });
      if (telegramError) {
        toast.add({ description: telegramError });
        return;
      }
    }
    const formData = buildOrgSectionFormData(sectionId, data, {
      idCardLogoCleared: opts?.idCardLogoCleared,
    });
    updateOrganization.mutate({ sectionIds: [sectionId], formData });
  };

  const saveAllDirtySections = (opts?: { idCardLogoCleared?: boolean }) => {
    const sectionIds = getDirtySchemaSectionIds(dirtyFields);
    if (sectionIds.length === 0) return;

    const data = form.getValues();
    const validationError = validateOrgSectionsForSave(sectionIds, data, {
      wasMicrosoftOnAtLoad: wasMicrosoftOnAtLoadRef.current,
      wasTelegramOnAtLoad: wasTelegramOnAtLoadRef.current,
      hasConnectedBot: hadTelegramBotAtLoadRef.current,
    });
    if (validationError) {
      toast.add({ description: validationError });
      return;
    }

    const formData = buildCombinedOrgFormData(sectionIds, data, {
      idCardLogoCleared: opts?.idCardLogoCleared,
    });
    updateOrganization.mutate({ sectionIds, formData });
  };

  const discardSharedFormChanges = () => {
    const sectionIds = getDirtySchemaSectionIds(dirtyFields);
    if (sectionIds.length === 0 || !orgRecord) return;

    const orgData = orgRecord as Record<string, unknown>;
    const writeOnly = new Set<string>([
      ...ORGANIZATION_MS_WRITE_ONLY_FIELD_KEYS,
      ...ORGANIZATION_TELEGRAM_WRITE_ONLY_FIELD_KEYS,
    ]);

    for (const sectionId of sectionIds) {
      const keys = getOrgSchemaSectionKeys(sectionId) ?? [];
      for (const key of keys) {
        if (writeOnly.has(key)) {
          form.setValue(key, "", { shouldDirty: false });
          continue;
        }
        const value = orgData[key];
        if (
          key === "id_card_org_name" ||
          key === "id_card_staff_accent" ||
          key === "id_card_student_accent"
        ) {
          form.setValue(key, value ?? "", { shouldDirty: false });
        } else {
          form.setValue(key, value, { shouldDirty: false });
        }
      }
    }
  };

  const dirtySchemaSectionCount = getDirtySchemaSectionIds(dirtyFields).length;

  return {
    form,
    objectFormSchema,
    fieldConfig,
    orgRecord,
    orgQuery,
    isMicrosoftOn,
    isTelegramOn,
    saveSection,
    saveAllDirtySections,
    discardSharedFormChanges,
    dirtySchemaSectionCount,
    isSaving: updateOrganization.isPending,
    refs: {
      wasMicrosoftOnAtLoadRef,
      wasTelegramOnAtLoadRef,
      hadTelegramBotAtLoadRef,
    },
  };
}

function useOrgFieldConfig({
  orgId,
  form,
  isMicrosoftOn,
  isTelegramOn,
  isGoogleOn,
  isConsultationOn,
  isCrmEnabled,
  isLibraryDisabled,
  isStudentsDmAdminsOnly,
  refs,
}: {
  orgId: string | number | undefined;
  form: UseFormReturn<z.infer<ReturnType<typeof getObjectFormSchema>>>;
  isMicrosoftOn: boolean;
  isTelegramOn: boolean;
  isGoogleOn: boolean;
  isConsultationOn: boolean;
  isCrmEnabled: boolean;
  isLibraryDisabled: boolean;
  isStudentsDmAdminsOnly: boolean;
  refs: OrgRecordFormRefs;
}) {
  return useMemo(() => {
    const fieldConfig: Record<string, FieldConfigItem> = {
      ...orgBooleanSwitchDefaults(),
      tagline: {
        description: "This will appear on the homepage of your organization.",
      },
      is_student_login_disabled: {
        description: (
          <p>
            <span className="text-destructive">Danger: </span>
            This prevents all students from logging in.
          </p>
        ),
      },
      available_domains: {
        fieldType: (props: AutoFormInputComponentProps) => (
          <ApprovedDomainsEditor
            value={props.field.value ?? []}
            onChange={(v) => props.field.onChange(v)}
          />
        ),
        description: isMicrosoftOn
          ? "New users must use an email address at one of these domains (the part after @)."
          : "Add approved email domains before enabling Microsoft account creation.",
      },
      timezone: {
        fieldType: (props: AutoFormInputComponentProps) => (
          <TimezoneSelector
            {...props.fieldProps}
            value={props.field.value}
            onChange={(v) => props.field.onChange(v)}
            isRequired={props.isRequired}
            formDescription={props.fieldConfigItem.description}
          />
        ),
      },
      time_display_format: {
        description: "How times appear in calendars, schedules, and labels.",
      },
      default_session_start_time: {
        description:
          "Default start time for new class sessions (simple scheduling).",
      },
      default_session_duration_minutes: {
        description:
          "Default length of a class session in minutes (simple scheduling).",
      },
      is_wd_we_course_types_enabled: {
        customLabel: "Use WD/WE course types",
      },
      campus_checkin_verification_mode: {
        renderParent: ({ children }: { children: React.ReactNode }) => {
          const isEnabled = form.getValues("is_building_checkin_enabled");
          if (!isEnabled) return null;
          return <>{children}</>;
        },
      },
      checkin_grace_period_minute: {
        renderParent: ({ children }: { children: React.ReactNode }) => {
          const isEnabled = form.getValues("is_building_checkin_enabled");
          if (!isEnabled) return null;
          return <>{children}</>;
        },
      },
      is_microsoft_on: {
        description:
          "Turn on Microsoft sign-in, Entra user provisioning, and Teams meeting features for your school.",
      },
      is_teams_creation_enabled: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description:
          "When enabled, Schedjuice creates a Microsoft Teams class for each new course in the background. Turn off if you use Microsoft sign-in but manage Teams elsewhere.",
      },
      is_teams_attendance_sync_enabled: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description:
          "When enabled, the nightly job pulls Microsoft Teams attendance reports into teacher payroll records. Leave off to avoid Graph API traffic unless you rely on automated teacher attendance.",
      },
      authority: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description:
          "MSAL authority URL, e.g. https://login.microsoftonline.com/yourdomain.onmicrosoft.com",
      },
      app_id: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description: "Application (client) ID from your Azure app registration.",
      },
      tenant_id: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description: "Directory (tenant) ID from Azure portal.",
      },
      thumbprint: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description: refs.wasMicrosoftOnAtLoadRef.current
          ? "Leave blank to keep the existing certificate thumbprint."
          : "Certificate thumbprint from your app registration.",
      },
      certificate_id: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description: "Optional. Leave blank to keep existing value.",
      },
      client_secret: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description: "Optional if using certificate-based Graph auth.",
      },
      default_owner_id: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description: refs.wasMicrosoftOnAtLoadRef.current
          ? "Leave blank to keep the existing organizer Object ID."
          : "Entra user Object ID (not the app client ID) used as Teams meeting organizer.",
      },
      delegated_account_upn: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description: refs.wasMicrosoftOnAtLoadRef.current
          ? "Leave blank to keep the existing delegated service account UPN."
          : "Entra sign-in UPN for delegated Graph flows (password reset, assignments, channel messages).",
      },
      delegated_account_password: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        inputProps: { type: "password" },
        description: refs.wasMicrosoftOnAtLoadRef.current
          ? "Leave blank to keep the existing delegated account password."
          : "Password for the delegated service account UPN.",
      },
      delegated_account_object_id: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description: refs.wasMicrosoftOnAtLoadRef.current
          ? "Leave blank to keep the existing delegated account Object ID."
          : "Entra Object ID of the delegated service account (Users > Object ID).",
      },
      staff_license_id: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description:
          "Optional. License SKU ID assigned when creating staff in Entra.",
      },
      student_license_id: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description:
          "Optional. License SKU ID assigned when creating students in Entra.",
      },
      meeting_sensitivity_label_id: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isMicrosoftOn ? <>{children}</> : null,
        description:
          "Optional Purview label for restricting recording access (Teams Premium).",
      },
      private_key: {
        fieldType: (props: AutoFormInputComponentProps) => {
          if (!isMicrosoftOn) return null;
          return (
            <Field.Root className="w-full max-w-xl" name={props.field.name}>
              <Field.Label>Private key (.pem)</Field.Label>
              <Field.Description>
                {refs.wasMicrosoftOnAtLoadRef.current
                  ? "Upload only to replace the existing private key."
                  : "Required for first-time setup. Upload the .pem matching your certificate."}
              </Field.Description>
              <Input
                type="file"
                accept=".pem,.key,application/x-pem-file,text/plain"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  props.field.onChange(file ?? undefined);
                  e.target.value = "";
                }}
              />
              {props.field.value instanceof File ? (
                <p className="text-sm text-text-muted">
                  Selected: {props.field.value.name}
                </p>
              ) : null}
            </Field.Root>
          );
        },
      },
      id_card_org_name: { renderParent: () => null },
      id_card_logo: { renderParent: () => null },
      id_card_staff_accent: { renderParent: () => null },
      id_card_student_accent: { renderParent: () => null },
      is_telegram_on: {
        description:
          "Turn on the Telegram bot for course groups, announcements, and invite DMs.",
      },
      is_telegram_login_on: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isTelegramOn ? <>{children}</> : null,
        description:
          "Show Telegram on the login page. Users must connect Telegram on their profile first. Add your site domain in @BotFather for the Login Widget.",
      },
      is_telegram_roster_sync_enabled: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isTelegramOn ? <>{children}</> : null,
        description:
          "When on, assigned teachers receive invite links via DM and join requests are auto-approved.",
      },
      telegram_bot_username: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isTelegramOn ? <>{children}</> : null,
        inputProps: { readOnly: true, disabled: true },
        description:
          "Filled automatically after a valid bot token is saved (e.g. @schoolbot).",
      },
      telegram_bot_token: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isTelegramOn ? <>{children}</> : null,
        fieldType: (props: AutoFormInputComponentProps) => {
          if (!isTelegramOn) return null;
          return (
            <Field.Root className="w-full max-w-xl" name={props.field.name}>
              <Field.Label>Telegram bot token</Field.Label>
              <Field.Description>
                {refs.hadTelegramBotAtLoadRef.current
                  ? "Paste a new token only to rotate. Leave blank to keep the current token."
                  : "Required for first-time setup. Paste the token from @BotFather."}
              </Field.Description>
              <Input
                type="password"
                autoComplete="off"
                placeholder="123456789:AA…"
                value={props.field.value ?? ""}
                onChange={(e) => props.field.onChange(e.target.value)}
              />
            </Field.Root>
          );
        },
      },
      is_google_on: {
        description:
          "Show Google on user profiles so people can connect their Google account.",
      },
      is_google_login_on: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isGoogleOn ? <>{children}</> : null,
        description:
          "Show Google on the login page. Users must connect Google on their profile first.",
      },
      is_consultation_booking_on: {
        description:
          "Turn on public booking links for consultants. Each consultant still needs Google connected and a weekly schedule.",
      },
      consultation_strategy: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isConsultationOn ? <>{children}</> : null,
        enumOptionLabels: {
          [ConsultationStrategy.lwtp]: "LWTP (daily 6–8 PM)",
        },
        description:
          "Preset applied when a consultant chooses the default weekly schedule. LWTP opens every day from 6:00 to 8:00 PM in your school timezone.",
      },
      is_crm_enabled: {
        description: "Show Leads and Issues in the sidebar for this school.",
      },
      is_student_teacher_group_chat_enabled: {
        description:
          "Use private student–teacher class chats instead of whole-roster course chat. New enrollments sync automatically; run the backfill command once after first enabling for existing students.",
      },
      is_students_dm_admins_only_enabled: {
        description:
          "When on, students may only start direct messages with the assigned student DM contact below.",
      },
      student_dm_contact_user_id: {
        customLabel: "Student DM contact",
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isStudentsDmAdminsOnly ? <>{children}</> : null,
        fieldType: (props: AutoFormInputComponentProps) => (
          <StudentDmContactPicker
            orgId={orgId}
            value={
              props.field.value != null && props.field.value !== ""
                ? Number(props.field.value)
                : null
            }
            onChange={(v) => props.field.onChange(v)}
          />
        ),
        description:
          "Required when admins-only direct messages are enabled. Students will only see this person in DM search.",
      },
      notify_lead_observers_on_status_change: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isCrmEnabled ? <>{children}</> : null,
      },
      notify_issue_observers_on_status_change: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          isCrmEnabled ? <>{children}</> : null,
      },
      library_title: {
        renderParent: ({ children }: { children: React.ReactNode }) =>
          !isLibraryDisabled ? <>{children}</> : null,
      },
    };

    for (const key of Object.keys(ORG_SETTING_HELP)) {
      fieldConfig[key] = {
        ...fieldConfig[key],
        description: <OrgSettingHelp settingKey={key} />,
      };
    }

    return fieldConfig;
  }, [
    form,
    isMicrosoftOn,
    isTelegramOn,
    isGoogleOn,
    isConsultationOn,
    isCrmEnabled,
    isLibraryDisabled,
    isStudentsDmAdminsOnly,
    orgId,
    refs,
  ]);
}
