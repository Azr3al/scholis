"use client";

import { fetchEntity } from "@/app/client-api/utils";
import { CourseCategoryField } from "@/components/course/course-category-field";
import { CourseSubjectField } from "@/components/course/course-subject-field";
import EntitySelect from "@/components/form/entity-select";
import { FormDirtyBeforeUnload } from "@/components/form/form-dirty-before-unload";
import {
  FieldLabelSuffix,
  RequiredMark,
} from "@/components/form/required-mark";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { EXAM_SESSION_YEARS_AHEAD } from "@/components/form/selectors/year-selector";
import { DatePicker } from "@/components/date/date-picker";
import { Button, Field, Input, Select } from "@/components/primitives";
import { Separator } from "@/components/primitives";
import { Textarea } from "@/components/primitives";
import { useToast } from "@/components/primitives";
import {
  SlotsSimpleScheduleField,
  courseTypeFromSlots,
} from "@/components/scheduling/slots-simple-schedule-field";
import { getDateISOString } from "@/helpers/date";
import {
  createCourseThenOptionalSchedule,
  createCourseThenSessionCreditSchedule,
  validateRecurringSlotsForCreate,
} from "@/helpers/create-course-schedule";
import {
  isCourseProgramFieldRequired,
  sanitizeCoursePayloadForProgram,
  shouldShowCourseProgramField,
  validateCourseProgramFields,
} from "@/helpers/course-program-validation";
import {
  setFormErrrors,
  handleNativeFormInvalid,
  scheduleScrollToFieldByName,
  scheduleScrollToFirstFormError,
} from "@/helpers/form";
import { usePaymentPlanOptionLabel } from "@/hooks/usePaymentPlanOptionLabel";
import { orgUsesWdWeNomenclature, resolveSessionDefaults } from "@/helpers/simple-schedule";
import {
  allowsMultipleSessionsPerDay,
  canSubmitCreate,
  creditPicksOverlapNote,
  impliedSpan,
  isSessionCreditProgram,
  substitutionReserveCap,
  type SessionCreditDraft,
} from "@/helpers/session-credit-draft";
import { isValidSessionTimeRange } from "@/helpers/session-time";
import { SessionCreditCreateCalendar } from "@/components/scheduling/session-credit-create-calendar";
import { invalidateCourseSummaryCaches } from "@/lib/course-cache";
import { queryClient } from "@/lib/query";
import { coursesKeys } from "@/sdk/keys/courses";
import {
  DEFAULT_COURSE_FIELDS,
  EXAM_BOARD_OPTIONS,
  partiallyOmittedCourseSchema,
} from "@/types/course";
import type { RecurringSlot } from "@/types/intake";
import { programType } from "@/types/program";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { addMonths } from "date-fns";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { willAutoAssignCreatorAsMainTeacher } from "@/helpers/course-create-auto-assign";
import { shouldWarnLongCourseDuration } from "@/helpers/course-duration-warning";
import { LongCourseDurationWarning } from "@/components/course/long-course-duration-warning";

type FormValues = z.infer<typeof partiallyOmittedCourseSchema>;

export function ManualCourseForm({ programId }: { programId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { tenant } = useTenant();
  const paymentPlanOptionLabel = usePaymentPlanOptionLabel();
  const { user } = useUser();
  const [duration, setDuration] = useState<number | null>(null);
  const [slots, setSlots] = useState<RecurringSlot[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [creditDraft, setCreditDraft] = useState<SessionCreditDraft>({
    maxSessions: 8,
    reserveCap: 0,
    timeFrom: "19:00",
    timeTo: "20:30",
    picks: [],
    capNote: null,
  });
  const showMicrosoftTeamNotice =
    Boolean(tenant?.is_microsoft_on) &&
    Boolean(tenant?.is_teams_creation_enabled);
  const showAutoAssignMtNotice = willAutoAssignCreatorAsMainTeacher({
    autoAssignFlag: Boolean(tenant?.auto_assign_creator_as_main_teacher),
    roles: user?.roles,
  });

  const { data: programData } = useQuery({
    queryKey: ["manual-create-program", programId],
    queryFn: () => fetchEntity("programs", programId),
  });
  const program = programData?.data?.data as programType | undefined;
  const isCredit = isSessionCreditProgram(program);
  const allowMultiplePerDay = allowsMultipleSessionsPerDay(program);

  useEffect(() => {
    const defaults = resolveSessionDefaults(tenant);
    setCreditDraft((prev) => {
      const reserveCap = substitutionReserveCap(program);
      if (prev.picks.length > 0) {
        return { ...prev, reserveCap };
      }
      return {
        ...prev,
        maxSessions: program?.default_max_sessions ?? prev.maxSessions,
        reserveCap,
        timeFrom: defaults.time_from,
        timeTo: defaults.time_to,
      };
    });
  }, [program, tenant]);

  const form = useForm<FormValues>({
    resolver: zodResolver(partiallyOmittedCourseSchema),
    defaultValues: {
      title: "",
      description: "",
      program: parseInt(programId, 10),
    },
  });

  useEffect(() => {
    form.setValue("program", parseInt(programId, 10));
  }, [programId, form]);

  useEffect(() => {
    if (!scheduleError) return;
    scheduleScrollToFieldByName("weekly_sessions");
  }, [scheduleError]);

  useEffect(() => {
    if (!isCredit) return;
    const span = impliedSpan(creditDraft.picks);
    if (!span) return;
    form.setValue("start_date", new Date(`${span.start}T12:00:00`));
    const end = new Date(`${span.end}T12:00:00`);
    if (span.end <= span.start) {
      end.setDate(end.getDate() + 1);
    }
    form.setValue("end_date", end);
  }, [isCredit, creditDraft.picks, form]);

  const examFieldsEnabled = Boolean(tenant?.is_exam_board_in_course_enabled);
  const idCardExpiryEnabled = Boolean(tenant?.is_course_id_card_expiry_enabled);

  const showDetailsFields = useMemo(() => {
    const skip = new Set([
      "program",
      "intake",
      "subject",
      "level",
      "section",
      "title",
      "description",
      "category",
      "start_date",
      "end_date",
      "id_card_expiry_date",
    ]);
    const fields = [
      ...DEFAULT_COURSE_FIELDS,
      ...(examFieldsEnabled
        ? (["exam_session_date", "exam_board"] as const)
        : []),
    ];
    return fields.filter((f) => !skip.has(f));
  }, [examFieldsEnabled]);

  const createMutation = useMutation({
    mutationFn: async ({
      payload,
      slots: submitSlots,
      credit,
    }: {
      payload: Record<string, unknown>;
      slots: RecurringSlot[];
      credit?: SessionCreditDraft;
    }) => {
      if (credit) {
        return createCourseThenSessionCreditSchedule({
          coursePayload: {
            ...payload,
            max_sessions: credit.maxSessions,
          },
          picks: credit.picks,
          title: String(payload.title ?? ""),
          allowMultiplePerDay,
        });
      }
      const start = payload.start_date
        ? new Date(payload.start_date as string)
        : null;
      const end = payload.end_date ? new Date(payload.end_date as string) : null;
      if (!start || !end) {
        throw new Error("Start and end dates are required");
      }
      return createCourseThenOptionalSchedule({
        coursePayload: payload,
        slots: submitSlots,
        title: String(payload.title ?? ""),
        startDate: start,
        endDate: end,
      });
    },
    onError: (err) => {
      if (err instanceof Error && /weekday|time|session/i.test(err.message)) {
        setScheduleError(err.message);
        return;
      }
      const applied = setFormErrrors(err, form);
      if (applied) scheduleScrollToFirstFormError(form);
    },
    onSuccess: (result) => {
      if (result.scheduleError) {
        toast.add({ type: "error", title: result.scheduleError });
      } else {
        toast.add({ title: "Course created" });
      }
      void queryClient.invalidateQueries({ queryKey: coursesKeys.all });
      void invalidateCourseSummaryCaches(queryClient, result.courseId);
      router.push(
        `/courses/${result.courseId}/edit?tab=edit-schedule&ref=/courses`,
      );
    },
  });

  const onSubmit = (data: FormValues) => {
    const programErrors = validateCourseProgramFields(
      data as Record<string, unknown>,
      program,
    );
    for (const [key, message] of Object.entries(programErrors)) {
      form.setError(key as any, { type: "manual", message });
    }
    if (Object.keys(programErrors).length > 0) {
      scheduleScrollToFirstFormError(form);
      return;
    }

    const slotErr = isCredit
      ? null
      : validateRecurringSlotsForCreate(slots, {
          requireAtLeastOne: true,
        });
    if (slotErr) {
      setScheduleError(slotErr);
      return;
    }
    if (isCredit && !canSubmitCreate(creditDraft, { allowMultiplePerDay })) {
      setScheduleError(
        creditPicksOverlapNote(creditDraft.picks) ??
          "Select exactly the max number of sessions.",
      );
      return;
    }
    if (
      isCredit &&
      !creditDraft.picks.every((pick) =>
        isValidSessionTimeRange(pick.time_from, pick.time_to),
      )
    ) {
      setScheduleError("Each session needs a valid start and end time.");
      return;
    }

    const sanitized = sanitizeCoursePayloadForProgram(
      data as Record<string, unknown>,
      program,
    );
    const payload: Record<string, unknown> = {
      ...sanitized,
      start_date: sanitized.start_date
        ? getDateISOString(sanitized.start_date as Date)
        : undefined,
      end_date: sanitized.end_date
        ? getDateISOString(sanitized.end_date as Date)
        : undefined,
    };
    if (sanitized.id_card_expiry_date) {
      payload.id_card_expiry_date = getDateISOString(
        sanitized.id_card_expiry_date as Date,
      );
    }
    if (sanitized.exam_session_date) {
      const d = new Date(sanitized.exam_session_date as string);
      payload.exam_session_date = new Date(
        d.getFullYear(),
        d.getMonth(),
        1,
      ).toISOString();
    }
    if (
      !isCredit &&
      orgUsesWdWeNomenclature(tenant?.is_wd_we_course_types_enabled)
    ) {
      const ct = courseTypeFromSlots(slots);
      if (ct) payload.course_type = ct;
    }
    createMutation.mutate({
      payload,
      slots,
      credit: isCredit ? creditDraft : undefined,
    });
  };

  const pid = parseInt(programId, 10);
  const showSubject = shouldShowCourseProgramField("subject", program);
  const watchStartDate = form.watch("start_date");
  const watchEndDate = form.watch("end_date");
  const hasStartDate = Boolean(watchStartDate);
  const showLongCourseDurationWarning = shouldWarnLongCourseDuration(
    tenant,
    watchStartDate ? new Date(watchStartDate) : null,
    watchEndDate ? new Date(watchEndDate) : null,
  );
  const isSubmitting = createMutation.isPending || createMutation.isLoading;

  return (
    <>
      <FormDirtyBeforeUnload control={form.control} />
      <form
        onSubmit={form.handleSubmit(onSubmit, () => scheduleScrollToFirstFormError(form))}
        onInvalidCapture={handleNativeFormInvalid}
        className="space-y-8"
      >
        <div>
          <h1 className="text-2xl font-semibold">Add a class</h1>
          <p className="text-sm text-text-muted">
            {program?.name ?? "Program"} — manual creation
          </p>
        </div>

        <fieldset disabled={isSubmitting} className="min-w-0 space-y-8 border-0 p-0 m-0">
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Identity</h2>
          <Controller
            control={form.control}
            name="title"
            render={({ field, fieldState }) => (
              <Field.Root>
                <Field.Label>
                  Title
                  <RequiredMark />
                </Field.Label>
                <Input {...field} value={field.value ?? ""} />
                {fieldState.error ? <Field.Error>{fieldState.error.message}</Field.Error> : null}
              </Field.Root>
            )}
          />
          <Controller
            control={form.control}
            name="description"
            render={({ field, fieldState }) => (
              <Field.Root>
                <Field.Label>
                  Description
                  <RequiredMark />
                </Field.Label>
                <Textarea {...field} value={field.value ?? ""} />
                {fieldState.error ? <Field.Error>{fieldState.error.message}</Field.Error> : null}
              </Field.Root>
            )}
          />
          <Controller
            control={form.control}
            name="category"
            render={({ field, fieldState }) => (
              <CourseCategoryField
                value={
                  typeof field.value === "number"
                    ? field.value
                    : Number(field.value) || null
                }
                onChange={(v) => field.onChange(v)}
                isRequired
                allowDeselect={false}
                error={fieldState.error?.message}
              />
            )}
          />
          {showSubject && (
            <Controller
              control={form.control}
              name="subject"
              render={({ field, fieldState }) => (
                <CourseSubjectField
                  programId={pid}
                  subjectStrategy={program?.subject_strategy}
                  value={field.value as number | null | undefined}
                  onChange={field.onChange}
                  isRequired={isCourseProgramFieldRequired("subject", program)}
                  error={fieldState.error?.message}
                />
              )}
            />
          )}
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Schedule</h2>
          {!program ? (
            <p className="text-sm text-text-muted">Loading schedule options.</p>
          ) : isCredit ? (
            <div className="space-y-4" data-field-name="weekly_sessions">
              <p className="text-sm text-text-muted">
                Pick {creditDraft.maxSessions} teaching dates on the calendar.
                {allowMultiplePerDay
                  ? " Multiple sessions on the same day are allowed."
                  : ""}
                {creditDraft.reserveCap > 0
                  ? ` You can add up to ${creditDraft.reserveCap} substitution reserve days after that.`
                  : ""}
              </p>
              <SessionCreditCreateCalendar
                draft={creditDraft}
                allowMultiplePerDay={allowMultiplePerDay}
                onChange={(next) => {
                  setCreditDraft(next);
                  setScheduleError(null);
                }}
              />
              {scheduleError ? (
                <p className="text-sm text-destructive" role="alert">
                  {scheduleError}
                </p>
              ) : null}
              {showLongCourseDurationWarning ? (
                <LongCourseDurationWarning />
              ) : null}
            </div>
          ) : (
            <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="start_date"
              render={({ field, fieldState }) => (
                <Field.Root>
                  <Field.Label>
                    Start date
                    <RequiredMark />
                  </Field.Label>
                  <DatePicker
                    date={field.value ? new Date(field.value) : undefined}
                    setDate={(date) => {
                      field.onChange(date ?? null);
                      if (!date) {
                        setDuration(null);
                      }
                    }}
                  />
                  {fieldState.error ? <Field.Error>{fieldState.error.message}</Field.Error> : null}
                </Field.Root>
              )}
            />
            <Controller
              control={form.control}
              name="end_date"
              render={({ field, fieldState }) => (
                <Field.Root>
                  <Field.Label>
                    End date
                    <RequiredMark />
                  </Field.Label>
                  <DatePicker
                    date={field.value ? new Date(field.value) : undefined}
                    setDate={(date) => field.onChange(date ?? null)}
                  />
                  {fieldState.error ? <Field.Error>{fieldState.error.message}</Field.Error> : null}
                </Field.Root>
              )}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Custom", value: null as number | null },
              { label: "1 month", value: 1 },
              { label: "3 months", value: 3 },
              { label: "6 months", value: 6 },
            ].map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant={duration === preset.value ? "primary" : "secondary"}
                className="h-auto min-h-[44px] justify-start"
                disabled={!hasStartDate}
                onClick={() => {
                  if (preset.value == null) {
                    setDuration(null);
                    return;
                  }
                  setDuration(preset.value);
                  const start = form.getValues("start_date");
                  if (start) {
                    form.setValue(
                      "end_date",
                      addMonths(new Date(start), preset.value),
                    );
                  }
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {showLongCourseDurationWarning ? <LongCourseDurationWarning /> : null}
          <div className="space-y-2" data-field-name="weekly_sessions">
            <h3 className="text-sm font-medium text-text-primary">
              Weekly sessions
              <RequiredMark />
            </h3>
            <p className="text-sm text-text-muted">
              Choose days and times for recurring sessions.
            </p>
            <SlotsSimpleScheduleField
              slots={slots}
              onChange={(next) => {
                setSlots(next);
                setScheduleError(null);
              }}
              idPrefix="manual-create"
              fieldMarks="required"
            />
            {scheduleError ? (
              <p className="text-sm text-destructive" role="alert">
                {scheduleError}
              </p>
            ) : null}
          </div>
            </>
          )}
          {idCardExpiryEnabled ? (
            <Controller
              control={form.control}
              name="id_card_expiry_date"
              render={({ field, fieldState }) => (
                <Field.Root>
                  <Field.Label>ID card expiry date</Field.Label>
                  <DatePicker
                    date={field.value ? new Date(field.value) : undefined}
                    setDate={(date) => field.onChange(date ?? null)}
                  />
                  {fieldState.error ? (
                    <Field.Error>{fieldState.error.message}</Field.Error>
                  ) : null}
                </Field.Root>
              )}
            />
          ) : null}
        </section>

        {showDetailsFields.length > 0 && (
          <>
            <Separator />
            <section className="space-y-4">
              <h2 className="text-lg font-medium">Details</h2>
              <div className="space-y-4">
              {showDetailsFields.includes("payment_plan") && (
                <Controller
                  control={form.control}
                  name="payment_plan"
                  rules={
                    tenant?.is_payment_plan_mandatory
                      ? {
                          required: "This organization requires a payment plan.",
                          validate: (v) =>
                            v != null && Number(v) > 0
                              ? true
                              : "This organization requires a payment plan.",
                        }
                      : undefined
                  }
                  render={({ field, fieldState }) => (
                    <Field.Root>
                      <Field.Label>
                        Payment plan
                        <FieldLabelSuffix
                          required={Boolean(tenant?.is_payment_plan_mandatory)}
                        />
                      </Field.Label>
                      <EntitySelect
                        entity="payment-plans"
                        displayFunction={paymentPlanOptionLabel}
                        value={field.value ?? 0}
                        onChange={(v) => field.onChange(v)}
                        label="Payment plan"
                        hideLabel
                        isRequired={Boolean(tenant?.is_payment_plan_mandatory)}
                      />
                      {fieldState.error ? <Field.Error>{fieldState.error.message}</Field.Error> : null}
                    </Field.Root>
                  )}
                />
              )}
              {showDetailsFields.includes("exam_session_date") && (
                <Controller
                  control={form.control}
                  name="exam_session_date"
                  rules={
                    examFieldsEnabled
                      ? {
                          required:
                            "This organization requires an exam session.",
                          validate: (v) =>
                            v
                              ? true
                              : "This organization requires an exam session.",
                        }
                      : undefined
                  }
                  render={({ field, fieldState }) => (
                    <Field.Root>
                      <Field.Label>
                        Exam session
                        <FieldLabelSuffix required={examFieldsEnabled} />
                      </Field.Label>
                      <Field.Description>
                        Exam session month and year.
                      </Field.Description>
                      <YearMonthSelector
                        date={
                          field.value ? new Date(field.value) : undefined
                        }
                        yearsAhead={EXAM_SESSION_YEARS_AHEAD}
                        fullWidth
                        setDate={(d) =>
                          field.onChange(
                            d
                              ? new Date(
                                  d.getFullYear(),
                                  d.getMonth(),
                                  1,
                                ).toISOString()
                              : null,
                          )
                        }
                        label=""
                      />
                      {fieldState.error ? <Field.Error>{fieldState.error.message}</Field.Error> : null}
                    </Field.Root>
                  )}
                />
              )}
              {showDetailsFields.includes("exam_board") && (
                <Controller
                  control={form.control}
                  name="exam_board"
                  rules={
                    examFieldsEnabled
                      ? {
                          required:
                            "This organization requires an exam board.",
                          validate: (v) =>
                            v
                              ? true
                              : "This organization requires an exam board.",
                        }
                      : undefined
                  }
                  render={({ field, fieldState }) => (
                    <Field.Root>
                      <Field.Label>
                        Exam board
                        <FieldLabelSuffix required={examFieldsEnabled} />
                      </Field.Label>
                      <Select
                        items={EXAM_BOARD_OPTIONS.map((opt) => ({
                          label: opt,
                          value: opt,
                        }))}
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange((v as string) || null)}
                        placeholder="Select exam board"
                        className="w-full"
                      />
                      {fieldState.error ? <Field.Error>{fieldState.error.message}</Field.Error> : null}
                    </Field.Root>
                  )}
                />
              )}
              </div>
            </section>
          </>
        )}

        {showMicrosoftTeamNotice ? (
          <>
            <Separator />
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-medium">Microsoft Team</p>
              <p className="text-sm text-muted-foreground">
                A Microsoft Team will be created for this class when you submit.
              </p>
            </div>
          </>
        ) : null}

        <div className="space-y-2">
          {showAutoAssignMtNotice ? (
            <p className="text-sm text-text-muted text-right">
              You are being auto-assigned as{" "}
              <span className="font-medium text-[var(--action,var(--data-green-strong,#2f6e58))]">
                main teacher
              </span>
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={
                isCredit &&
                (!canSubmitCreate(creditDraft, { allowMultiplePerDay }) ||
                  !creditDraft.picks.every((pick) =>
                    isValidSessionTimeRange(pick.time_from, pick.time_to),
                  ))
              }
            >
              Create course
            </Button>
          </div>
        </div>
        </fieldset>
      </form>
    </>
  );
}
