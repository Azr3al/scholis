"use client";

import { useMemo, type ReactNode } from "react";
import { usePageHeader } from "@/components/shell/use-page-header";
import { RecordParentSectionBreadcrumb } from "@/components/shell/record-parent-section-breadcrumb";
import {
  RECORD_SECTIONS,
  type RecordSectionId,
} from "@/components/record/record-sections";

const USER_RECORD_CONTEXT_PARENT = { label: "Users", href: "/users" } as const;

export function UserRecordPageHeader({
  section,
  actions,
}: {
  section: RecordSectionId;
  actions?: ReactNode;
}) {
  const sectionLabel =
    RECORD_SECTIONS.find((entry) => entry.id === section)?.label ?? "Overview";

  const pageHeader = useMemo(
    () => ({
      breadcrumb: (
        <RecordParentSectionBreadcrumb
          parent={USER_RECORD_CONTEXT_PARENT}
          section={sectionLabel}
        />
      ),
      actions,
    }),
    [sectionLabel, actions],
  );

  usePageHeader(pageHeader);
  return null;
}
