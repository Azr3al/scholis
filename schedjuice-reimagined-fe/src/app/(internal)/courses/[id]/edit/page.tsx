"use client";
import { PageContainer } from "@/components/layout/page-container";
import {
  deleteEntity,
  fetchEntity,
  searchEntities,
  updateEntity,
} from "@/app/client-api/utils";
import { CourseScheduleEditor } from "@/components/calendar/course-schedule/course-schedule-editor";

import MemberEditTab from "@/components/course/member-edit-tab";
import RescheduleWarningText from "@/components/course/reschedule-warning-text";
import {
  defaultEditorOptions,
  getDefaultEditorOptions,
} from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import DeleteZone from "@/components/form/delete-zone";
import { AutosaveProvider } from "@/components/form/autosave-context";
import { AutosaveUnloadGuard } from "@/components/form/autosave-unload-guard";
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { buildDiffPayload } from "@/lib/autosave/autosave-core";
import AdaptiveBackButton from "@/components/nav/adaptive-back-button";
import {
  AutoFormGroupSection,
  AutoFormSkeleton,
  getObjectFormSchema,
  type AutoFormGroup,
  type AutoFormInputComponentProps,
} from "@/components/auto-form";
import { FormSaveTick } from "@/components/edit-kit";
import {
  Button,
  buttonVariants,
  Skeleton,
  Tabs,
} from "@/components/primitives";
import { useToast } from "@/components/primitives";
import {
  canCreateCourse,
  canDeleteCourse,
  canManageCourseRoster,
  canManageCourseSchedule,
} from "@/helpers/authorization";
import {
  getCreatedByIdFromCourse,
  getTeacherMemberIdsFromCourse,
} from "@/helpers/course-hub";
import { cleanDatesForBackend } from "@/helpers/date";
import { coerceEntityId } from "@/helpers/entity-ids";
import {
  buildCourseFormValues,
  type CourseWithFkIds,
} from "@/helpers/course-form-values";
import { setFormErrrors } from "@/helpers/form";
import { usePaymentPlanOptionLabel } from "@/hooks/usePaymentPlanOptionLabel";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";
import useCourseCreateUpdateStore from "@/store/course-create-update";
import { operatorEnum } from "@/types/api";
import {
  courseType,
  eventType,
  partiallyOmittedCourseSchema,
  DEFAULT_COURSE_FIELDS,
  EXAM_BOARD_OPTIONS,
  COURSE_FORM_UI_EXCLUDED_KEYS,
  normalizeCourseFieldKeyForForm,
} from "@/types/course";
import { RequiredMark } from "@/components/form/required-mark";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEditor } from "@tiptap/react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import * as z from "zod";
import { CourseCategoryField } from "@/components/course/course-category-field";
import EntitySelect from "@/components/form/entity-select";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { EXAM_SESSION_YEARS_AHEAD } from "@/components/form/selectors/year-selector";
import { Field, Select } from "@/components/primitives";
import { buildCourseProgramFieldConfig } from "@/components/course/course-program-field-config";
import {
  buildCourseFormFieldOrder,
  sanitizeCoursePayloadForProgram,
  validateCourseProgramFields,
} from "@/helpers/course-program-validation";
import { CourseZoomMeetingEditSection } from "@/components/course/course-zoom-meeting-edit-section";
import { MicrosoftTeamCard } from "@/components/microsoft/microsoft-team-card";
import { buildCourseEditSectionsFromFieldOrder } from "./course-edit-sections";
import { programType } from "@/types/program";
import { stripUntouchedExamFields } from "@/helpers/course-edit-payload";

const CourseEditPage = () => {
  const [course, setCourse] = useState<courseType | null>(null);
  const [events, setEvents] = useState<eventType[]>([]);
  const scheduleDirtyRef = useRef(false);
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "edit-info";

  const { user } = useUser();
  const { tenant } = useTenant();
  const paymentPlanOptionLabel = usePaymentPlanOptionLabel();

  const examFieldsEnabled = Boolean(tenant?.is_exam_board_in_course_enabled);
  const idCardExpiryEnabled = Boolean(tenant?.is_course_id_card_expiry_enabled);

  const fieldOrder = useMemo(() => {
    const excluded = new Set(COURSE_FORM_UI_EXCLUDED_KEYS);
    const seen = new Set<string>();
    const baseFields = [
      ...DEFAULT_COURSE_FIELDS,
      ...(examFieldsEnabled
        ? (["exam_session_date", "exam_board"] as const)
        : []),
      ...(idCardExpiryEnabled ? (["id_card_expiry_date"] as const) : []),
    ];
    const orgOrder = baseFields
      .map((k) => normalizeCourseFieldKeyForForm(k))
      .filter((k) => {
        if (!k || excluded.has(k) || seen.has(k)) {
          return false;
        }
        seen.add(k);
        return true;
      });
    return buildCourseFormFieldOrder(orgOrder, { includeProgramField: true });
  }, [examFieldsEnabled, idCardExpiryEnabled]);
  const pathname = usePathname();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const router = useRouter();
  const editor = useEditor(getDefaultEditorOptions());

  const {
    data,
    isSuccess,
    refetch: refetchCourse,
  } = useQuery({
    queryKey: [`getCourse${id}`],
    queryFn: () =>
      fetchEntity("courses", id, [
        "user_courses",
        "user_courses.user",
        "subject",
        "program",
        "created_by",
        "category",
        "payment_plan",
      ]),
  });
  const { data: eventData, refetch: refetchEvents } = useQuery({
    enabled: false,
    queryKey: [`getEventsOfCourse${id}`],
    queryFn: () =>
      searchEntities(
        "events",
        { size: -1, expand: ["course"] },
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: id,
            },
          ],
        }
      ),
  });

  const courseUpdateMutation = useMutation({
    mutationKey: [`updateCourse${id}`],
    mutationFn: (data: any) => updateEntity("courses", id, data),
    onSuccess: () => {
      toast.add({
        title: "Course updated",
        description: "Your changes have been saved.",
      });
      refetchCourse();
    },
    onError: (e) => {
      toast.add({
        title: "Error",
        description: "Failed to update course.",
      });
      setFormErrrors(e, adminForm);
    },
  });

  const adminObjectFormSchema = getObjectFormSchema(
    partiallyOmittedCourseSchema
  );
  const adminForm = useForm<z.infer<typeof adminObjectFormSchema>>({
    resolver: zodResolver(partiallyOmittedCourseSchema),
  });
  adminForm.watch(["category", "program"]);
  const watchedProgramId = adminForm.watch("program");

  const onSubmit = (data: z.infer<typeof partiallyOmittedCourseSchema>) => {
    const programFromCourse =
      course?.program && typeof course.program === "object"
        ? (course.program as programType)
        : undefined;
    const programErrors = validateCourseProgramFields(data, programFromCourse);
    for (const [key, message] of Object.entries(programErrors)) {
      adminForm.setError(key as any, { type: "manual", message });
    }
    if (Object.keys(programErrors).length > 0) return;

    const sanitized = sanitizeCoursePayloadForProgram(data, programFromCourse);
    const payload = cleanDatesForBackend(
      stripUntouchedExamFields(sanitized),
      ["start_date", "end_date"],
    );
    if (sanitized.exam_session_date) {
      const d = new Date(sanitized.exam_session_date);
      payload.exam_session_date = new Date(
        d.getFullYear(),
        d.getMonth(),
        1,
      ).toISOString();
    }
    courseUpdateMutation.mutate(payload);
  };

  const programFromCourse = useMemo<programType | undefined>(
    () =>
      course?.program && typeof course.program === "object"
        ? (course.program as programType)
        : undefined,
    [course],
  );

  const HIGH_RISK_COURSE_FIELDS = useMemo(
    () => new Set(["start_date", "end_date"]),
    [],
  );

  const autosave = useAutosaveForm({
    form: adminForm,
    queryKey: [`getCourse${id}`],
    units: [["intake", "level", "section", "subject"]],
    enabled: Boolean(course),
    shouldAutosaveField: (name) => !HIGH_RISK_COURSE_FIELDS.has(name),
    validateFields: async (fields) => {
      await adminForm.trigger(fields as never);
      const invalid = new Set(
        fields.filter((f) => adminForm.getFieldState(f as never).invalid),
      );
      const programErrors = validateCourseProgramFields(
        adminForm.getValues(),
        programFromCourse,
      );
      for (const [key, message] of Object.entries(programErrors)) {
        if (fields.includes(key)) {
          adminForm.setError(key as never, { type: "manual", message });
          invalid.add(key);
        }
      }
      return Array.from(invalid);
    },
    buildPayload: (fields, values) => {
      const diff = buildDiffPayload(values, fields);
      const sanitized = sanitizeCoursePayloadForProgram(diff, programFromCourse);
      const payload = cleanDatesForBackend(
        stripUntouchedExamFields(sanitized),
        [
          "start_date",
          "end_date",
          "id_card_expiry_date",
        ],
      ) as Record<string, unknown>;
      // sanitize re-adds `program`; only keep it when program itself changed.
      if (!fields.includes("program")) delete payload.program;
      if (payload.exam_session_date) {
        const d = new Date(payload.exam_session_date as string);
        payload.exam_session_date = new Date(
          d.getFullYear(),
          d.getMonth(),
          1,
        ).toISOString();
      }
      return payload;
    },
    save: async (payload) => {
      try {
        const res = await updateEntity("courses", id, payload);
        void refetchCourse();
        return res;
      } catch (e) {
        setFormErrrors(e, adminForm);
        toast.add({
          title: "Error",
          description: "Failed to save course changes.",
        });
        throw e;
      }
    },
  });

  const saveSchedule = useCallback(() => {
    const { start_date, end_date } = adminForm.getValues();
    courseUpdateMutation.mutate(
      cleanDatesForBackend({ start_date, end_date }, ["start_date", "end_date"]),
    );
  }, [adminForm, courseUpdateMutation]);

  const courseEditSections = useMemo(
    () => buildCourseEditSectionsFromFieldOrder([...fieldOrder]),
    [fieldOrder]
  );

  const courseEditGroups: AutoFormGroup[] = useMemo(
    () =>
      courseEditSections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        fields: section.keys,
      })),
    [courseEditSections],
  );

  const courseSkeletonGroups: AutoFormGroup[] = useMemo(
    () => [
      {
        id: "basics",
        title: "Class basics",
        fields: ["program", "intake", "title", "description", "category"],
      },
      {
        id: "schedule",
        title: "Schedule",
        fields: ["start_date", "end_date"],
      },
      {
        id: "details",
        title: "Class details",
        fields: ["subject", "payment_plan", "code", "batch_number"],
      },
    ],
    [],
  );

  const teacherMemberIds = useMemo(
    () => getTeacherMemberIdsFromCourse(course),
    [course],
  );

  const createdById = useMemo(
    () => getCreatedByIdFromCourse(course),
    [course],
  );

  const canManageRoster = Boolean(
    user && course && canManageCourseRoster(user, teacherMemberIds, createdById),
  );

  const canManageSchedule = Boolean(
    user && course && canManageCourseSchedule(user, teacherMemberIds, createdById),
  );

  const restrictedTabs: Record<string, boolean> = {
    "edit-members": canManageRoster,
    "edit-schedule": canManageSchedule,
  };

  const selectedProgram = useMemo((): programType | undefined => {
    if (course?.program && typeof course.program === "object") {
      return course.program as programType;
    }
    if (watchedProgramId == null) return undefined;
    return { id: Number(watchedProgramId) } as programType;
  }, [course, watchedProgramId]);

  const programFieldConfig = useMemo(
    () =>
      buildCourseProgramFieldConfig({
        form: adminForm,
        selectedProgram,
        mode: "edit",
        programReadOnly: true,
      }),
    [adminForm, selectedProgram],
  );

  const courseFieldConfig = useMemo(
    () => ({
      ...programFieldConfig,
      code: {
        inputProps: {
          disabled:
            !tenant ||
            !user ||
            !course ||
            !canCreateCourse(tenant, user, course),
        },
      },
      start_date: {
        inputProps: {
          disabled:
            !tenant ||
            !user ||
            !course ||
            !canCreateCourse(tenant, user, course),
        },
      },
      end_date: {
        inputProps: {
          disabled:
            !tenant ||
            !user ||
            !course ||
            !canCreateCourse(tenant, user, course),
        },
      },
      category: {
        fieldType: ({
          field,
          isRequired,
          fieldConfigItem,
          label,
        }: AutoFormInputComponentProps) => (
          <CourseCategoryField
            value={coerceEntityId(field.value)}
            onChange={(v) => {
              field.onChange(v);
              field.onBlur();
            }}
            isRequired={isRequired}
            formDescription={fieldConfigItem.description}
            label={label}
            allowDeselect={false}
          />
        ),
      },
      payment_plan: {
        fieldType: ({
          field,
          fieldConfigItem,
          label,
          isRequired,
        }: AutoFormInputComponentProps) => (
          <EntitySelect
            displayFunction={paymentPlanOptionLabel}
            entity="payment-plans"
            value={coerceEntityId(field.value) ?? 0}
            onChange={(v) => {
              field.onChange(v);
              autosave.commitField("payment_plan");
            }}
            formDescription={fieldConfigItem.description}
            label={label}
            isRequired={
              isRequired || Boolean(tenant?.is_payment_plan_mandatory)
            }
          />
        ),
      },
      subject: programFieldConfig.subject,
      exam_session_date: {
        description: "Month and year only.",
        fieldType: ({
          field,
          fieldConfigItem,
          label,
          isRequired,
          error,
        }: AutoFormInputComponentProps) => (
          <Field.Root
            className="w-full max-w-xl"
            name={field.name}
            invalid={Boolean(error)}
          >
            <Field.Label>
              {label}
              {isRequired || examFieldsEnabled ? <RequiredMark /> : null}
            </Field.Label>
            <YearMonthSelector
              date={
                field.value ? new Date(field.value) : undefined
              }
              yearsAhead={EXAM_SESSION_YEARS_AHEAD}
              setDate={(d) => {
                field.onChange(
                  d
                    ? new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
                    : null,
                );
                field.onBlur();
              }}
              label=""
            />
            {fieldConfigItem.description ? (
              <Field.Description>{fieldConfigItem.description}</Field.Description>
            ) : null}
            <div className="min-h-5">
              {error ? (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </Field.Root>
        ),
      },
      exam_board: {
        fieldType: ({
          field,
          fieldConfigItem,
          label,
          isRequired,
          error,
        }: AutoFormInputComponentProps) => (
          <Field.Root
            className="w-full max-w-xl"
            name={field.name}
            invalid={Boolean(error)}
          >
            <Field.Label>
              {label}
              {isRequired || examFieldsEnabled ? <RequiredMark /> : null}
            </Field.Label>
            <Select
              placeholder="Select exam board"
              items={EXAM_BOARD_OPTIONS.map((opt) => ({
                label: opt,
                value: opt,
              }))}
              value={field.value ?? null}
              onValueChange={(v) => {
                field.onChange(v || null);
                field.onBlur();
              }}
            />
            {fieldConfigItem.description ? (
              <Field.Description>{fieldConfigItem.description}</Field.Description>
            ) : null}
            <div className="min-h-5">
              {error ? (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </Field.Root>
        ),
      },
    }),
    [tenant, user, course, programFieldConfig, paymentPlanOptionLabel, autosave, examFieldsEnabled]
  );

  useEffect(() => {
    if (!course) {
      return;
    }
    const c = course as CourseWithFkIds;
    const formValues = buildCourseFormValues(c);
    adminForm.reset(formValues as Record<string, unknown> & z.infer<typeof partiallyOmittedCourseSchema>, {
      keepDefaultValues: false,
      // Autosave refetches course data; preserve unsaved high-risk fields (dates).
      keepDirtyValues: true,
    });
  }, [course]);

  useEffect(() => {
    if (course?.default_daily_note) {
      editor?.commands.setContent(course.default_daily_note);
    }
  }, [course, editor]);

  useEffect(() => {
    if (!isSuccess || !data?.data?.data) {
      return;
    }
    setCourse({
      ...data.data.data,
    });
  }, [isSuccess, data]);

  useEffect(() => {
    if (!eventData) return;
    // Do not overwrite unsaved schedule drafts (e.g. is_deleted markers).
    if (scheduleDirtyRef.current) return;
    setEvents(eventData.data.data);
  }, [eventData]);

  useEffect(() => {
    if (activeTab === "edit-students" && id) {
      router.replace(`/courses/${id}/students`);
    }
  }, [activeTab, id, router]);

  useEffect(() => {
    if (activeTab === "edit-schedule") {
      refetchEvents();
    }
  }, [activeTab, refetchEvents]);

  useEffect(() => {
    if (!course || activeTab === "edit-info") return;
    if (!(activeTab in restrictedTabs)) return;
    if (restrictedTabs[activeTab]) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
  }, [
    activeTab,
    canManageRoster,
    canManageSchedule,
    course,
    pathname,
    router,
    searchParams,
  ]);

  return (
    <PageContainer width="narrow">
      <AutosaveUnloadGuard status={autosave.status} />
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <AdaptiveBackButton to={`/courses/${id}`}></AdaptiveBackButton>
        </div>
        {(!tenant || !user || !course) && (
          <div
            className="space-y-5"
            aria-busy="true"
            aria-label="Loading class editor"
          >
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-2xl" />
            <div className="mx-auto w-full max-w-6xl space-y-6 px-4 sm:px-6">
              <AutoFormSkeleton groups={courseSkeletonGroups} saveMode="edit" />
              <section className="space-y-4 border-b border-border pb-6">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-44" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                </div>
                <Skeleton className="h-36 w-full rounded-xl" />
              </section>
              <Skeleton className="h-10 w-36" />
            </div>
          </div>
        )}
        {tenant && user && course && (
          <Tabs.Root
            value={activeTab}
            onValueChange={(next) => {
              const params = new URLSearchParams(searchParams.toString());
              if (next === "edit-info") {
                params.delete("tab");
              } else {
                params.set("tab", String(next));
              }
              const qs = params.toString();
              router.replace(`${pathname}${qs ? `?${qs}` : ""}`, {
                scroll: false,
              });
            }}
          >
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-accent">Class editor</p>
                  <h1 className="text-2xl font-semibold text-text-primary">
                    {course.title}
                  </h1>
                  <p className="text-sm text-text-secondary">
                    Edit your class step by step. Schedule and assignment tools
                    open only when accessed.
                  </p>
                </div>
                <Link
                  href={`/courses/${id}`}
                  className={cn(buttonVariants({ variant: "secondary", size: "sm"  }))}
                >
                  View course
                </Link>
              </div>
            </div>
            <Tabs.List className="relative mt-3 gap-4 border-b border-border pb-0">
              <Tabs.Tab
                className="relative h-10 rounded-none px-0 pb-3 data-[active]:text-text-primary"
                value="edit-info"
              >
                Information
              </Tabs.Tab>
              {canManageRoster && (
                <Tabs.Tab
                  className="relative h-10 rounded-none px-0 pb-3 data-[active]:text-text-primary"
                  value="edit-members"
                >
                  Teachers
                </Tabs.Tab>
              )}
              {canManageSchedule && (
                <Tabs.Tab
                  className="relative h-10 rounded-none px-0 pb-3 data-[active]:text-text-primary"
                  value="edit-schedule"
                >
                  Schedule
                </Tabs.Tab>
              )}
              <Tabs.Indicator className="!bottom-0 !top-auto !z-10 !h-0.5 !rounded-none !bg-brand !mix-blend-normal" />
            </Tabs.List>
            <Tabs.Panel value="edit-info" className="space-y-3">
              {canCreateCourse(tenant, user, course) && (
                <RescheduleWarningText />
              )}
              <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
                <AutosaveProvider value={autosave}>
                  <FormProvider {...adminForm}>
                    <form
                      className="space-y-6"
                      onSubmit={adminForm.handleSubmit((data) => {
                        if (data.code === "") {
                          delete data.code;
                        }
                        onSubmit(
                          data as z.infer<typeof partiallyOmittedCourseSchema>,
                        );
                      })}
                    >
                      <div
                        className="mb-4 flex min-h-5 items-center"
                        data-slot="auto-form-save-tick"
                      >
                        <FormSaveTick visible={autosave.status === "saved"} />
                      </div>
                      <div className="space-y-6">
                        {courseEditGroups.map((group) => (
                          <section
                            key={group.id}
                            className="space-y-4 border-b border-border pb-6"
                          >
                            <AutoFormGroupSection
                              group={group}
                              shape={adminObjectFormSchema.shape}
                              fieldConfig={courseFieldConfig as Record<
                                string,
                                import("@/components/auto-form").FieldConfigItem
                              >}
                              onFieldBlur={(name) =>
                                autosave.bindField(name).onBlur()
                              }
                            />
                            {group.id === "schedule" ? (
                              <div className="mt-4">
                                <Button
                                  type="button"
                                  onClick={saveSchedule}
                                  isLoading={courseUpdateMutation.isLoading}
                                >
                                  Save schedule
                                </Button>
                              </div>
                            ) : null}
                          </section>
                        ))}
                        {canCreateCourse(tenant, user, course) && tenant ? (
                          <CourseZoomMeetingEditSection
                            course={course}
                            tenant={tenant}
                            onUpdated={() => {
                              void refetchCourse();
                            }}
                          />
                        ) : null}
                        <MicrosoftTeamCard
                          course={course}
                          viewerAccount={user}
                          tenant={tenant}
                          teacherMemberIds={teacherMemberIds}
                          createdById={createdById}
                          onUpdated={() => {
                            void refetchCourse();
                          }}
                        />
                      </div>
                    </form>
                  </FormProvider>
                </AutosaveProvider>
              </div>
              {editor && (
                <section className="space-y-3 border-b border-border pb-6">
                  <div className="space-y-1">
                    <h2 className="font-serif text-xl text-text-primary">
                      Daily Note Template
                    </h2>
                    <p className="text-sm text-text-secondary">
                      Default template for daily notes. Used when creating new
                      notes for course events.
                    </p>
                  </div>
                  <TextEditor editor={editor} />
                  <Button
                    onClick={() => {
                      const data = {
                        default_daily_note: editor.getJSON(),
                      };
                      onSubmit(data);
                    }}
                    type="button"
                    isLoading={courseUpdateMutation.isLoading}
                  >
                    Save Daily Note
                  </Button>
                </section>
              )}
              {canDeleteCourse(user) && (
                <DeleteZone
                  entityName="course"
                  entityId={id}
                  deleteApiUrl="courses"
                  validateInputKey="title"
                ></DeleteZone>
              )}
            </Tabs.Panel>
            {canManageRoster && (
              <Tabs.Panel value="edit-members">
                {course && activeTab === "edit-members" ? (
                  <MemberEditTab course={course} />
                ) : null}
              </Tabs.Panel>
            )}
            {canManageSchedule && (
              <Tabs.Panel value="edit-schedule">
                {eventData && course ? (
                  <CourseScheduleEditor
                    onDirtyChange={(dirty) => {
                      scheduleDirtyRef.current = dirty;
                    }}
                    onSaveSuccess={async () => {
                      refetchCourse();
                      const result = await refetchEvents();
                      return (result.data?.data?.data ?? []) as eventType[];
                    }}
                    course={course}
                    setCourse={setCourse}
                    events={events}
                    setEvents={setEvents}
                  />
                ) : (
                  <div className="space-y-5 pt-10">
                    <Skeleton className="h-20 w-full"></Skeleton>
                    <Skeleton className="h-20 w-full"></Skeleton>
                    <Skeleton className="h-20 w-full"></Skeleton>
                    <Skeleton className="h-20 w-full"></Skeleton>
                  </div>
                )}
              </Tabs.Panel>
            )}
          </Tabs.Root>
        )}
      </div>
    </PageContainer>
  );
};

export default CourseEditPage;
