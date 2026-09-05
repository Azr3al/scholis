"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "iconoir-react";
import { PageContainer } from "@/components/layout/page-container";
import { ComplaintConversation } from "@/components/complaints/complaint-conversation";
import { usePageHeader } from "@/components/shell/use-page-header";
import { Skeleton } from "@/components/primitives";
import { EmptyState } from "@/components/primitives/empty";
import { useTenant } from "@/hooks/useTenant";
import { useComplaint } from "@/hooks/complaints/use-complaints";
import { useMemo } from "react";

export default function ComplaintThreadPage() {
  const { id } = useParams<{ id: string }>();
  const issueId = Number(id);
  const { tenant } = useTenant();
  const { data: issue, isLoading, error } = useComplaint(issueId);

  const adminTitle = tenant?.name?.trim() || "School Administration";

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <Link
          href="/complaints"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          Complaints by Parents
        </Link>
      ),
      toolbarSecondary: issue ? (
        <p className="text-sm text-text-muted">{issue.title}</p>
      ) : null,
    }),
    [issue],
  );
  usePageHeader(headerConfig);

  if (!Number.isFinite(issueId)) {
    return (
      <PageContainer className="w-full min-w-0">
        <EmptyState>
          <p className="text-sm text-text-muted">Complaint not found. Check the link and try again.</p>
        </EmptyState>
      </PageContainer>
    );
  }

  if (isLoading) {
    return (
      <PageContainer className="w-full min-w-0 space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-[min(70vh,720px)] w-full rounded-xl" />
      </PageContainer>
    );
  }

  if (error || !issue) {
    return (
      <PageContainer className="w-full min-w-0">
        <EmptyState>
          <p className="text-sm text-text-muted">
            Complaint not found. It may have been removed or you may not have access.
          </p>
        </EmptyState>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="flex min-h-[min(70vh,720px)] w-full min-w-0 flex-col">
      <ComplaintConversation issue={issue} adminTitle={adminTitle} />
    </PageContainer>
  );
}
