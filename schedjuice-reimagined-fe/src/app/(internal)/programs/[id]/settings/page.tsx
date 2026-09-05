"use client";
import { cn } from "@/lib/utils";
import {
  adminCrudDetailSectionClassName,
  adminCrudStatusBadgeClassName,
  adminCrudSurfaceBodyClassName,
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";
import { Button, buttonVariants } from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import { ProgramLevelsEditor } from "@/components/program/program-levels-editor";
import { ProgramLevelSubjectsPanel } from "@/components/program/program-level-subjects-editor";
import { ProgramSubjectsEditor } from "@/components/program/program-subjects-editor";
import AutoForm, {
  AutoFormSkeleton,
  getDefaultValues,
  getObjectFormSchema,
  type AutoFormGroup,
} from "@/components/auto-form";
import { useToast } from "@/components/primitives";
import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
import {
  programCreateUpdateSchema,
  programToFormValues,
  programType,
  SubjectStrategy,
} from "@/types/program";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useUser } from "@/hooks/useUser";
import {
  appendActiveStatusGroup,
  canManageActiveStatus,
  highRiskFieldsWithActive,
} from "@/lib/form/field-visibility";

const BASE_HIGH_RISK_SETTINGS_FIELDS = [
  "course_creation_method",
  "subject_strategy",
  "is_session_credit_scheduling",
  "default_max_sessions",
  "allow_multiple_sessions_per_day",
  "is_substitution_reserve_enabled",
  "default_substitution_reserve_days",
] as const;

const programSettingsGroupsBase: AutoFormGroup[] = [
  {
    id: "identity",
    title: "General",
    description: "Autosaves on blur; also included when you Save general settings.",
    fields: ["name", "description"],
  },
  {
    id: "rules",
    title: "Creation method and subject rules",
    description: "Affects new courses — save explicitly.",
    fields: [
      "course_creation_method",
      "subject_strategy",
      "is_session_credit_scheduling",
      "default_max_sessions",
      "allow_multiple_sessions_per_day",
      "is_substitution_reserve_enabled",
      "default_substitution_reserve_days",
    ],
  },
];

const ProgramSettingsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const canManageActive = canManageActiveStatus(user);
  const programSettingsGroups = useMemo(
    () => appendActiveStatusGroup(programSettingsGroupsBase, canManageActive),
    [canManageActive],
  );
  const highRiskSettingsFields = useMemo(
    () =>
      highRiskFieldsWithActive(BASE_HIGH_RISK_SETTINGS_FIELDS, canManageActive),
    [canManageActive],
  );
  const toast = useToast();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["getProgramSettings", id],
    queryFn: () => fetchEntity("programs", id),
  });
  const program = data?.data?.data as programType | undefined;
  const objectFormSchema = getObjectFormSchema(programCreateUpdateSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(programCreateUpdateSchema),
    defaultValues: getDefaultValues(programCreateUpdateSchema),
    values: program ? programToFormValues(program) : undefined,
  });
  const isSessionCreditScheduling = form.watch("is_session_credit_scheduling");
  const isSubstitutionReserveEnabled = form.watch(
    "is_substitution_reserve_enabled",
  );

  const updateProgram = useMutation({
    mutationFn: (payload: Partial<programType>) =>
      updateEntity("programs", id, payload),
    onError: (err) => {
      setFormErrrors(err, form);
      scheduleScrollToFirstFormError(form);
    },
    onSuccess: () => {
      toast.add({ title: "Program saved" });
      refetch();
    },
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

  const saveGeneralSettings = useCallback(() => {
    // Flush identity + rules together so leaving after editing name/description
    // without blur still persists (pre-F2 Submit parity for this button).
    const values = form.getValues();
    const payload: Record<string, unknown> = {
      name: values.name,
      description: values.description,
    };
    for (const key of highRiskSettingsFields) {
      payload[key] = values[key];
    }
    updateProgram.mutate(payload as Partial<programType>);
  }, [form, highRiskSettingsFields, updateProgram]);

  const headerConfig = useMemo(
    () =>
      program
        ? {
            breadcrumb: (
              <div className="min-w-0">
                <h1 className="truncate font-serif text-lg text-text-primary">
                  {program.name}
                </h1>
                <p className="truncate text-xs text-text-muted">
                  Program settings
                </p>
              </div>
            ),
          }
        : null,
    [program],
  );
  usePageHeader(headerConfig);

  if (isLoading || !program) {
    return (
      <PageContainer width="default" className="space-y-6">
        <AutoFormSkeleton groups={programSettingsGroups} saveMode="edit" />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="default" className="space-y-6">
      <Link
        href={`/programs/${id}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm"  }),
          "size-9 p-0",
        )}
        aria-label="Back"
      >
        <NavArrowLeft width={16} height={16} aria-hidden />
      </Link>
      <div className={adminCrudSurfaceClassName()}>
        <div className={adminCrudSurfaceHeaderClassName()}>
          <h2 className="font-semibold text-text-primary">General</h2>
          <div className="text-sm text-text-muted">
            Creation method and subject rules for new courses.
          </div>
        </div>
        <div className={adminCrudSurfaceBodyClassName()}>
          <AutoForm
            form={form}
            schema={programCreateUpdateSchema}
            saveMode="edit"
            groups={programSettingsGroups}
            onAutosave={handleAutosave}
            autosaveQueryKey={["getProgramSettings", id]}
            fieldConfig={{
              course_creation_method: { autosave: false },
              subject_strategy: { autosave: false },
              is_session_credit_scheduling: {
                autosave: false,
                customLabel: "Session-credit scheduling",
                description:
                  "Teachers pick a fixed number of dates on the calendar instead of a weekly pattern. Manual programs only.",
              },
              default_max_sessions: {
                autosave: false,
                description:
                  "Seeded onto new courses in this program. Existing courses keep their own max.",
                renderParent: isSessionCreditScheduling ? undefined : () => null,
              },
              allow_multiple_sessions_per_day: {
                autosave: false,
                customLabel: "Multiple sessions per day",
                description:
                  "Allow more than one session on the same calendar date. Total max sessions still applies.",
                renderParent: isSessionCreditScheduling ? undefined : () => null,
              },
              is_substitution_reserve_enabled: {
                autosave: false,
                customLabel: "Substitution reserve days",
                description:
                  "Extra calendar days held for substitution on session-credit courses.",
                renderParent: isSessionCreditScheduling ? undefined : () => null,
              },
              default_substitution_reserve_days: {
                autosave: false,
                customLabel: "Default reserve days",
                description:
                  "How many buffer days staff can add beyond max sessions (0–10).",
                renderParent:
                  isSessionCreditScheduling && isSubstitutionReserveEnabled
                    ? undefined
                    : () => null,
              },
              ...(canManageActive ? { is_active: { autosave: false } } : {}),
              intake_count: {
                renderParent: () => null,
              },
            }}
            shouldAutosaveField={(name) =>
              !highRiskSettingsFields.includes(name) && name !== "intake_count"
            }
          >
            <div className="mt-6 flex min-h-10 items-center gap-3">
              <Button
                type="button"
                onClick={saveGeneralSettings}
                isLoading={updateProgram.isLoading}
              >
                Save general settings
              </Button>
            </div>
          </AutoForm>
        </div>
      </div>
      <div className={adminCrudSurfaceClassName()}>
        <div className={adminCrudSurfaceHeaderClassName()}>
          <h2 className="font-semibold text-text-primary">Subjects in this program</h2>
          <div className="text-sm text-text-muted">
            Org-wide subjects linked to this program&apos;s catalog. Each intake
            generates one class per subject.
          </div>
        </div>
        <div className={adminCrudSurfaceBodyClassName()}>
          <ProgramSubjectsEditor
            programId={id}
            subjectStrategy={program.subject_strategy}
          />
        </div>
      </div>
      {program.subject_strategy !== SubjectStrategy.required && (
        <div className={adminCrudSurfaceClassName()}>
          <div className={adminCrudSurfaceHeaderClassName()}>
            <h2 className="font-semibold text-text-primary">Levels and sections</h2>
            <div className="text-sm text-text-muted">
              K-12 structure: each level × section becomes a course when you
              generate from an intake.
            </div>
          </div>
          <div className={adminCrudSurfaceBodyClassName()}>
            <ProgramLevelsEditor programId={id} />
          </div>
        </div>
      )}
      <div className={adminCrudSurfaceClassName()}>
        <div className={adminCrudSurfaceHeaderClassName()}>
          <h2 className="font-semibold text-text-primary">Curriculum by level</h2>
          <div className="text-sm text-text-muted">
            Default subjects for each level. All sections in a level inherit
            these subjects when generating courses from an intake.
          </div>
        </div>
        <div className={adminCrudSurfaceBodyClassName()}>
          <ProgramLevelSubjectsPanel
            programId={id}
            subjectStrategy={program.subject_strategy}
          />
        </div>
      </div>
    </PageContainer>
  );
};

export default ProgramSettingsPage;
