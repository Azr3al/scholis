"use client";

import { OrgRecordShell } from "@/components/org/record/org-record-shell";
import { useParams } from "next/navigation";

export default function OrganizationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <OrgRecordShell
      mode="platform"
      orgId={id}
      railMountedExternally
      recordBasePath={`/internal/organizations/${id}`}
    />
  );
}
