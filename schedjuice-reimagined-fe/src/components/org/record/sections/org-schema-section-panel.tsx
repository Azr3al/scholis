"use client";

import {
  getRegistryEntry,
  visibleOrgSubGroups,
  type OrgRecordContext,
} from "@/config/org-settings-registry";
import {
  AutoFormGroupSection,
  getObjectFormSchema,
  type FieldConfigItem,
} from "@/components/auto-form";
import { FormProvider, type UseFormReturn } from "react-hook-form";
import {
  OrgPropagationNote,
  OrgSectionPanel,
} from "./org-section-panel";

export function OrgSchemaSectionPanel({
  sectionId,
  form,
  objectFormSchema,
  fieldConfig,
  recordContext,
  showPropagationNote,
  childrenBefore,
  childrenAfter,
}: {
  sectionId: string;
  form: UseFormReturn<Record<string, unknown>>;
  objectFormSchema: ReturnType<typeof getObjectFormSchema>;
  fieldConfig: Record<string, FieldConfigItem>;
  recordContext?: OrgRecordContext | null;
  showPropagationNote?: boolean;
  childrenBefore?: React.ReactNode;
  childrenAfter?: React.ReactNode;
}) {
  const entry = getRegistryEntry(sectionId);
  const allSubGroups = entry?.subGroups;
  if (!entry || !allSubGroups?.length) return null;

  const subGroups = recordContext
    ? visibleOrgSubGroups(allSubGroups, recordContext)
    : [...allSubGroups];
  if (!subGroups.length) return null;

  const hideInnerHeaders = subGroups.length === 1;

  return (
    <OrgSectionPanel
      title={entry.title}
      description={entry.description}
      footer={showPropagationNote ? <OrgPropagationNote /> : undefined}
    >
      <FormProvider {...form}>
        {childrenBefore}
        <div className="flex flex-col gap-10">
          {subGroups.map((sub) => (
            <AutoFormGroupSection
              key={sub.id}
              hideHeader={hideInnerHeaders}
              group={{
                id: sub.id,
                title: sub.title,
                description: sub.description,
                fields: [...sub.keys],
              }}
              shape={objectFormSchema.shape}
              fieldConfig={fieldConfig}
            />
          ))}
        </div>
        {childrenAfter}
      </FormProvider>
    </OrgSectionPanel>
  );
}
