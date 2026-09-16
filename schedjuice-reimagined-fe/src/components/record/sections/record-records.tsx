"use client";
import { useMemo } from "react";
import { InlineGroup } from "@/components/record/inline/inline-group";
import { InlineBuiltinGroup } from "@/components/record/inline/inline-builtin-group";
import { getExcludedColumns } from "@/helpers/visibility";
import { canEditUser } from "@/helpers/authorization";
import {
  OPERATIONAL_SECTIONS,
  type HardcodedSectionId,
} from "@/lib/custom-fields/build-form-sections";
import { canViewHrSection } from "@/lib/hr/visibility";
import { accountVisibilitySchema, getUserSchema, type accountType } from "@/types/user";
import type { FormConfig } from "@/types/form-config";
import type { FormActor } from "@/lib/custom-fields/field-policy";
import type { organizationType } from "@/types/organization";

const RECORDS_OPERATIONAL_IDS = new Set<HardcodedSectionId>(["checkin", "hr", "zoom"]);

export function RecordRecords({
  subject,
  viewer,
  tenant,
  recordQueryKey,
  editConfig,
}: {
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  recordQueryKey: unknown[];
  editConfig: FormConfig | undefined;
}) {
  const actor: FormActor =
    viewer.email && subject.email && viewer.email === subject.email ? "user" : "admin";
  const redactedKeys = getExcludedColumns(viewer, accountVisibilitySchema, "user");
  const canEdit = canEditUser(viewer, subject.id);
  const groups = editConfig?.groups ?? [];

  const availableKeys = useMemo(() => {
    const base = getUserSchema(viewer, tenant ?? undefined);
    return new Set(Object.keys(base.shape));
  }, [viewer, tenant]);

  const showHr = canViewHrSection({ viewer, tenant });

  const operationalSections = useMemo(
    () =>
      OPERATIONAL_SECTIONS.filter(
        (op) =>
          RECORDS_OPERATIONAL_IDS.has(op.id) &&
          (op.id !== "hr" || showHr) &&
          op.keys.some((k) => availableKeys.has(k)),
      ),
    [availableKeys, showHr],
  );

  return (
    <div className="sj-root flex flex-col gap-8">
      {groups.map((g) => (
        <InlineGroup
          key={g.id ?? g.name}
          group={g}
          subject={subject}
          viewer={viewer}
          tenant={tenant}
          actor={actor}
          recordQueryKey={recordQueryKey}
          redactedKeys={redactedKeys}
          canEdit={canEdit}
        />
      ))}
      {operationalSections.map((op) => (
        <InlineBuiltinGroup
          key={op.id}
          sectionId={op.id as "checkin" | "hr" | "zoom"}
          keys={op.keys.filter((k) => availableKeys.has(k))}
          subject={subject}
          viewer={viewer}
          tenant={tenant}
          recordQueryKey={recordQueryKey}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
