"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import DeleteZone from "@/components/form/delete-zone";
import AutoForm, {
  AutoFormSkeleton,
  getDefaultValues,
  type AutoFormGroup,
} from "@/components/auto-form";
import {
  AlertDialog,
  Button,
  buttonVariants,
} from "@/components/primitives";
import { useToast } from "@/components/primitives";
import { formatDate, getDateISOString } from "@/helpers/date";
import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
import { cn } from "@/lib/utils";
import {
  intakeEditFieldsSchema,
  intakeEditFormValues,
  intakeEditSchema,
  intakeToFormValues,
  intakeType,
} from "@/types/intake";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";

type IntakeCourseConflict = {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
};

type IntakeCourseRangeAction = "adjust" | "ignore";

type UpdateIntakeVariables = {
  payload: intakeEditFormValues;
  action?: IntakeCourseRangeAction;
};

const HIGH_RISK_INTAKE_FIELDS = ["start_date", "end_date"] as const;

const intakeEditGroups: AutoFormGroup[] = [
  {
    id: "identity",
    title: "Intake",
    fields: ["name", "description"],
  },
  {
    id: "dates",
    title: "Date range",
    description:
      "Changing dates may affect linked courses — save explicitly.",
    fields: ["start_date", "end_date"],
  },
];

function buildIntakeUpdateBody(
  payload: intakeEditFormValues,
  action?: IntakeCourseRangeAction,
) {
  return {
    name: payload.name,
    description: payload.description || "",
    start_date: getDateISOString(new Date(payload.start_date)),
    end_date: getDateISOString(new Date(payload.end_date)),
    ...(action ? { course_range_action: action } : {}),
  };
}

function getIntakeConflictDetails(err: unknown): {
  courses: IntakeCourseConflict[];
  message?: string;
} | null {
  const details = (err as { response?: { data?: { details?: unknown } } })
    ?.response?.data?.details;
  if (details == null || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const record = details as Record<string, unknown>;
  if (record.code !== "courses_outside_intake_range") return null;

  const courses = Array.isArray(record.courses)
    ? (record.courses as IntakeCourseConflict[])
    : [];
  const nonField = Array.isArray(record.non_field_errors)
    ? record.non_field_errors.map(String).join(" ")
    : undefined;

  return { courses, message: nonField };
}

const IntakeEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictCourses, setConflictCourses] = useState<IntakeCourseConflict[]>(
    [],
  );
  const [conflictMessage, setConflictMessage] = useState<string | undefined>();
  const [pendingPayload, setPendingPayload] = useState<
    intakeEditFormValues | undefined
  >();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["getIntake", id],
    queryFn: () => fetchEntity("intakes", id, ["program"]),
  });
  const intake = data?.data?.data as intakeType | undefined;
  const programName =
    intake && typeof intake.program === "object" ? intake.program.name : null;
  const form = useForm<intakeEditFormValues>({
    resolver: zodResolver(intakeEditSchema),
    defaultValues: getDefaultValues(intakeEditFieldsSchema),
    values: intake ? intakeToFormValues(intake) : undefined,
  });

  const updateIntake = useMutation({
    mutationKey: ["updateIntake", id],
    mutationFn: ({ payload, action }: UpdateIntakeVariables) =>
      updateEntity("intakes", id, buildIntakeUpdateBody(payload, action)),
    onError: (err, variables) => {
      const conflict = getIntakeConflictDetails(err);
      if (conflict) {
        setPendingPayload(variables.payload);
        setConflictCourses(conflict.courses);
        setConflictMessage(conflict.message);
        setConflictOpen(true);
        return;
      }
      setFormErrrors(err, form);
      scheduleScrollToFirstFormError(form);
    },
    onSuccess: (_data, variables) => {
      setConflictOpen(false);
      setPendingPayload(undefined);
      setConflictCourses([]);
      setConflictMessage(undefined);
      if (variables.action === "adjust") {
        toast.add({
          title: "Intake updated",
          description: "Linked courses were adjusted to fit the new date range.",
        });
        return;
      }
      if (variables.action === "ignore") {
        toast.add({
          title: "Intake updated",
          description:
            "Some linked courses remain outside the new intake date range.",
        });
        return;
      }
      toast.add({ title: "Intake updated" });
    },
  });

  const handleAutosave = useCallback(
    async (diff: Record<string, unknown>) => {
      try {
        return await updateEntity("intakes", id, diff);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        throw e;
      }
    },
    [form, id],
  );

  const saveDates = useCallback(() => {
    const payload = form.getValues();
    updateIntake.mutate({ payload });
  }, [form, updateIntake]);

  const submitWithAction = (action?: IntakeCourseRangeAction) => {
    const payload = pendingPayload ?? form.getValues();
    updateIntake.mutate({ payload, action });
  };

  return (
    <PageContainer width="narrow" className="space-y-6">
      <div className="space-y-4">
        <Link
          href={`/intakes/${id}`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm"  }),
            "-ml-3 size-9 p-0",
          )}
          aria-label="Back to intake"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        </Link>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Edit intake
          </h1>
          {programName ? (
            <p className="text-sm text-text-secondary">
              Program: {programName}
            </p>
          ) : null}
        </header>
      </div>
      {isLoading || isFetching || !intake ? (
        <AutoFormSkeleton groups={intakeEditGroups} saveMode="edit" />
      ) : (
        <AutoForm
          form={form}
          schema={intakeEditSchema}
          saveMode="edit"
          groups={intakeEditGroups}
          onAutosave={handleAutosave}
          autosaveQueryKey={["getIntake", id]}
          units={[["start_date", "end_date"]]}
          fieldConfig={{
            start_date: { autosave: false },
            end_date: { autosave: false },
          }}
          shouldAutosaveField={(name) =>
            !(HIGH_RISK_INTAKE_FIELDS as readonly string[]).includes(name)
          }
        >
          {form.formState.errors.root ? (
            <div
              data-form-root-error
              className="mb-4 rounded-md border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger"
              role="alert"
            >
              {String(form.formState.errors.root.message)}
            </div>
          ) : null}
          <div className="mt-6 flex min-h-10 items-center gap-3">
            <Button
              type="button"
              onClick={saveDates}
              isLoading={updateIntake.isLoading}
            >
              Save date range
            </Button>
          </div>
        </AutoForm>
      )}
      {intake ? (
        <DeleteZone
          validateInputKey="name"
          entityName="intake"
          entityId={id}
          deleteApiUrl="intakes"
        />
      ) : null}

      <AlertDialog.Root
        open={conflictOpen}
        onOpenChange={(open) => {
          setConflictOpen(open);
          if (!open) {
            setPendingPayload(undefined);
            setConflictCourses([]);
            setConflictMessage(undefined);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup className="w-full max-w-md">
            <AlertDialog.Title>
              Courses outside the new intake range
            </AlertDialog.Title>
            <AlertDialog.Description className="space-y-3 text-left">
              <span className="block">
                {conflictMessage ??
                  "Some linked courses fall outside the new intake date range."}
              </span>
              {conflictCourses.length > 0 ? (
                <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-text-primary">
                  {conflictCourses.map((course) => (
                    <li key={course.id}>
                      <span className="font-medium">{course.title}</span>
                      <span className="text-text-secondary">
                        {" "}
                        ({formatDate(course.start_date)} –{" "}
                        {formatDate(course.end_date)})
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <span className="block">
                Adjust the linked courses to fit inside the new intake range, or
                save the intake and leave those courses outside the range.
              </span>
            </AlertDialog.Description>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                disabled={updateIntake.isLoading}
                isLoading={updateIntake.isLoading}
                onClick={() => submitWithAction("adjust")}
              >
                Adjust courses to fit
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={updateIntake.isLoading}
                onClick={() => submitWithAction("ignore")}
              >
                Keep courses outside range
              </Button>
              <AlertDialog.Close
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={updateIntake.isLoading}
                  >
                    Cancel
                  </Button>
                }
              />
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </PageContainer>
  );
};

export default IntakeEditPage;
