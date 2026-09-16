"use client";
import { Button, useToast } from "@/components/primitives";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EditPencil } from "iconoir-react";
import { RecordSection } from "@/components/record/record-section";
import { updateEntity } from "@/app/client-api/utils";
import {
  hydrateUserForForm,
  prepareUserFormPayload,
} from "@/components/users/user-form-utils";
import {
  renderUserSectionFields,
  type UserFormFieldsContext,
} from "@/components/users/user-form-fields";
import type { HardcodedSectionId } from "@/lib/custom-fields/build-form-sections";
import { getUserSchema } from "@/types/user";
import type { accountType } from "@/types/user";
import type { organizationType } from "@/types/organization";
import { mergeUserRecordCache } from "@/lib/user/merge-user-record-cache";
import { cn } from "@/lib/utils";

const SECTION_LABELS: Record<
  Exclude<HardcodedSectionId, "identity" | "public_profile">,
  { title: string; labels: Record<string, string> }
> = {
  checkin: {
    title: "Building check-in",
    labels: {
      preferred_checkin_time: "Preferred check-in time",
      preferred_checkout_time: "Preferred check-out time",
      access_log_name: "Name from access log",
    },
  },
  payroll: {
    title: "Payroll",
    labels: {
      working_hour_per_month: "Working hours per month",
      salary: "Salary",
      per_session_rate: "Per session rate",
      per_hour_rate: "Per hour rate",
      student_bonus_hourly_rate: "Student bonus hourly rate",
    },
  },
  hr: {
    title: "HR",
    labels: {
      contract_expiry_date: "Contract expiry date",
      probation_end_date: "Probation end date",
      employment_start_date: "Employment start date",
      employment_type: "Employment type",
    },
  },
  zoom: {
    title: "Zoom attendance",
    labels: {
      zoom_user_identifier: "Zoom attendance match",
    },
  },
};

function formatReadValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (value instanceof Date) return value.toLocaleDateString();
  if (key === "employment_type") {
    if (value === "full_time") return "Full time";
    if (value === "part_time") return "Part time";
  }
  return String(value);
}

export function InlineBuiltinGroup({
  sectionId,
  keys,
  subject,
  viewer,
  tenant,
  recordQueryKey,
  canEdit,
}: {
  sectionId: Exclude<HardcodedSectionId, "identity" | "public_profile">;
  keys: string[];
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  recordQueryKey: unknown[];
  canEdit: boolean;
}) {
  const meta = SECTION_LABELS[sectionId];
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const preSubmitSyncRef = useRef<Set<() => void>>(new Set());

  const defaultValues = useMemo(
    () => hydrateUserForForm(subject, tenant),
    [subject, tenant],
  );

  const schema = useMemo(() => {
    const base = getUserSchema(viewer, tenant ?? undefined);
    const pickKeys = keys.filter((k) => k in base.shape) as [string, ...string[]];
    if (pickKeys.length === 0) return base;
    return base.pick(
      pickKeys.reduce(
        (acc, k) => {
          acc[k] = true;
          return acc;
        },
        {} as Record<string, true>,
      ),
    );
  }, [viewer, tenant, keys]);

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
      preSubmitSyncRef.current.forEach((sync) => sync());
      const normalized = prepareUserFormPayload(form.getValues() as Record<string, unknown>, {
        mode: "edit",
        tenant,
      });
      const payload: Record<string, unknown> = {};
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(normalized, key)) {
          payload[key] = normalized[key];
        }
      }
      return updateEntity("users", String(subject.id), payload);
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
      toast.add({ title: `${meta.title} saved` });
      setEditing(false);
    },
    onError: () =>
      toast.add({ title: `Could not save ${meta.title}` }),
  });

  const registerPreSubmit = (fn: () => void) => {
    preSubmitSyncRef.current.add(fn);
    return () => {
      preSubmitSyncRef.current.delete(fn);
    };
  };

  const fieldsContext: UserFormFieldsContext = {
    form,
    mode: "edit",
    viewerAccount: viewer,
    tenant,
    measure: "full",
    myanmarAddress: { region: "", city: "", township: "" },
    registerPreSubmit,
  };

  const subjectRecord = subject as unknown as Record<string, unknown>;

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
      <RecordSection title={meta.title} action={editAction}>
        <dl className="flex flex-col">
          {keys.map((key) => (
            <div key={key} className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-text-muted">{meta.labels[key] ?? key}</dt>
              <dd className="text-right text-text-primary">
                {formatReadValue(key, subjectRecord[key])}
              </dd>
            </div>
          ))}
        </dl>
      </RecordSection>
    );
  }

  return (
    <RecordSection title={meta.title}>
      <div className="rounded-lg bg-surface-sunken/40 p-4">
        <FormProvider {...form}>
          <form
            onSubmit={form.handleSubmit(() => save.mutate())}
            className={cn("flex flex-col gap-4")}
          >
            {renderUserSectionFields(sectionId, fieldsContext)}
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
