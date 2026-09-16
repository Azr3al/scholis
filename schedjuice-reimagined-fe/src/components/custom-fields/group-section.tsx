"use client";

import { AddressCluster } from "@/components/custom-fields/address-cluster";
import { FieldRenderer } from "@/components/custom-fields/field-renderer";
import { partitionAddressFields } from "@/lib/custom-fields/address-keys";
import {
  isFieldReadOnly,
  isFieldRequired,
  type FormActor,
} from "@/lib/custom-fields/field-policy";
import type { FormConfigGroup, FormSurface } from "@/types/form-config";
import { CUSTOM_FIELD_ENTITY_USER } from "@/types/custom-fields";
import type { UseFormReturn } from "react-hook-form";

export interface GroupSectionProps {
  form: UseFormReturn<any>;
  group: FormConfigGroup;
  surface: FormSurface;
  actor: FormActor;
  commitField?: (name: string) => void;
  entityType?: string;
}

export function GroupSection({
  form,
  group,
  surface,
  actor,
  commitField,
  entityType = CUSTOM_FIELD_ENTITY_USER,
}: GroupSectionProps) {
  const { addressFields, otherFields } = partitionAddressFields(group.fields);

  return (
    <div className="space-y-4">
      {addressFields.length > 0 ? (
        <AddressCluster
          form={form}
          readOnly={addressFields.every((f) => isFieldReadOnly(f, actor))}
        />
      ) : null}
      {otherFields.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {otherFields.map((field) => (
            <FieldRenderer
              key={field.id}
              form={form}
              field={field}
              required={isFieldRequired(field, surface)}
              readOnly={isFieldReadOnly(field, actor)}
              commitField={commitField}
              entityType={entityType}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
