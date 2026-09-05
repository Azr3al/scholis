"use client";

import { PageContainer } from "@/components/layout/page-container";
import BackButton from "@/components/misc/back-button";
import { useParams } from "next/navigation";
import DeleteZone from "@/components/form/delete-zone";
export default function DataVerificationRequestEditPage() {
  const { id } = useParams<{ id: string }>();

  return  (
<PageContainer width="narrow" className="space-y-3">
      <BackButton href={`/data-verification-requests/${id}`}></BackButton>

      <DeleteZone
        entityName="Data Verification Request"
        entityId={id}
        deleteApiUrl="data-verification-requests"
        validateInputKey="name"
      ></DeleteZone>
    </PageContainer>
);
}
