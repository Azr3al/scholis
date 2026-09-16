"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAutosaveForm } from "@/hooks/use-autosave-form";
import { updateEntity } from "@/app/client-api/utils";
import { InlineField } from "@/components/record/inline/inline-field";
import { UserConnectorsSection } from "@/components/connectors/user-connectors-section";
import { UserResignationDetails } from "@/components/users/user-resignation-details";
import { UserSignatureSection } from "@/components/users/user-signature-section";
import { UserPhotosSection } from "@/components/users/user-photos-section";
import { RecordSection, RecordFieldStack } from "@/components/record/record-section";
import { UserFieldHistorySheet } from "@/components/record/user-field-history-sheet";
import { Button } from "@/components/primitives";
import { accountType } from "@/types/user";
import { isStaffSubject } from "@/lib/points/visibility";
import {
  canViewPeopleFieldHistory,
  overviewFieldLocked,
} from "@/lib/users/steward-fields";
import { useQueryClient } from "@tanstack/react-query";
import type { organizationType } from "@/types/organization";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  alternative_name: z.string().optional(),
  communication_email: z
    .string()
    .email("Enter a valid email")
    .or(z.literal(""))
    .optional(),
  phone_number: z.string().optional(),
  email: z.string().optional(),
  house_number: z.string().optional(),
  street: z.string().optional(),
  township: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
});

function empty(value: string | null | undefined) {
  return value ?? "";
}

export function RecordOverview({
  subject,
  viewer,
  tenant,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  recordQueryKey: unknown[];
}) {
  const qc = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);
  const showHistory = canViewPeopleFieldHistory(viewer, subject);

  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: empty(subject.name),
      alternative_name: empty(subject.alternative_name),
      communication_email: empty(subject.communication_email),
      phone_number: empty(subject.phone_number),
      email: empty(subject.email),
      house_number: empty(subject.house_number),
      street: empty(subject.street),
      township: empty(subject.township),
      city: empty(subject.city),
      region: empty(subject.region),
      country: empty(subject.country),
    },
    mode: "onChange",
  });

  useEffect(() => {
    form.reset({
      name: empty(subject.name),
      alternative_name: empty(subject.alternative_name),
      communication_email: empty(subject.communication_email),
      phone_number: empty(subject.phone_number),
      email: empty(subject.email),
      house_number: empty(subject.house_number),
      street: empty(subject.street),
      township: empty(subject.township),
      city: empty(subject.city),
      region: empty(subject.region),
      country: empty(subject.country),
    });
  }, [
    subject.name,
    subject.alternative_name,
    subject.communication_email,
    subject.phone_number,
    subject.email,
    subject.house_number,
    subject.street,
    subject.township,
    subject.city,
    subject.region,
    subject.country,
    form,
  ]);

  const { bindField, commitField, fieldStatus } = useAutosaveForm({
    form,
    save: (diff) => updateEntity("users", String(subject.id), diff),
    queryKey: recordQueryKey,
  });

  function fieldLocked(field: string) {
    return overviewFieldLocked({ viewer, subject, field });
  }

  return (
    <div className="flex flex-col gap-8">
      <UserResignationDetails user={subject} />

      <RecordSection
        title="Profile"
        action={
          showHistory ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen(true)}
            >
              History
            </Button>
          ) : null
        }
      >
        <RecordFieldStack>
          <InlineField
            form={form}
            name="name"
            label="Full name"
            status={fieldStatus["name"]}
            bindField={bindField}
            commitField={commitField}
            locked={fieldLocked("name")}
          />
          <InlineField
            form={form}
            name="alternative_name"
            label="Alternative name"
            status={fieldStatus["alternative_name"]}
            bindField={bindField}
            commitField={commitField}
            locked={fieldLocked("alternative_name")}
          />
          <InlineField
            form={form}
            name="communication_email"
            label="Communication email"
            type="email"
            status={fieldStatus["communication_email"]}
            bindField={bindField}
            commitField={commitField}
            locked={fieldLocked("communication_email")}
          />
          <InlineField
            form={form}
            name="phone_number"
            label="Phone"
            type="tel"
            status={fieldStatus["phone_number"]}
            bindField={bindField}
            commitField={commitField}
            locked={fieldLocked("phone_number")}
          />
          <InlineField
            form={form}
            name="email"
            label="Primary email"
            locked
            bindField={bindField}
            commitField={commitField}
          />
        </RecordFieldStack>
      </RecordSection>

      <RecordSection title="Address">
        <RecordFieldStack>
          <InlineField
            form={form}
            name="house_number"
            label="House number"
            status={fieldStatus["house_number"]}
            bindField={bindField}
            commitField={commitField}
            locked={fieldLocked("house_number")}
          />
          <InlineField
            form={form}
            name="street"
            label="Street"
            status={fieldStatus["street"]}
            bindField={bindField}
            commitField={commitField}
            locked={fieldLocked("street")}
          />
          <InlineField
            form={form}
            name="township"
            label="Township"
            status={fieldStatus["township"]}
            bindField={bindField}
            commitField={commitField}
            locked={fieldLocked("township")}
          />
          <InlineField
            form={form}
            name="city"
            label="City"
            status={fieldStatus["city"]}
            bindField={bindField}
            commitField={commitField}
            locked={fieldLocked("city")}
          />
          <InlineField
            form={form}
            name="region"
            label="Region"
            status={fieldStatus["region"]}
            bindField={bindField}
            commitField={commitField}
            locked={fieldLocked("region")}
          />
          <InlineField
            form={form}
            name="country"
            label="Country"
            status={fieldStatus["country"]}
            bindField={bindField}
            commitField={commitField}
            locked={fieldLocked("country")}
          />
        </RecordFieldStack>
      </RecordSection>

      <UserPhotosSection
        subject={subject}
        viewer={viewer}
        recordQueryKey={recordQueryKey}
      />

      {isStaffSubject(subject) ? (
        <UserSignatureSection
          subject={subject}
          viewer={viewer}
          recordQueryKey={recordQueryKey}
        />
      ) : null}

      <UserConnectorsSection
        user={subject}
        viewerAccount={viewer}
        tenant={tenant}
        onUpdated={() => qc.invalidateQueries({ queryKey: recordQueryKey })}
      />

      {showHistory ? (
        <UserFieldHistorySheet
          userId={subject.id}
          subjectName={subject.name ?? "this person"}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        />
      ) : null}
    </div>
  );
}
