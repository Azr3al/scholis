"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "iconoir-react";
import { useMemo, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { ComplaintComposer } from "@/components/complaints/complaint-composer";
import { Switch } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { useCreateComplaint } from "@/hooks/complaints/use-complaints";

export default function NewComplaintPage() {
  const router = useRouter();
  const { tenant } = useTenant();
  const { user } = useUser(false);
  const createComplaint = useCreateComplaint();
  const [fileAnonymously, setFileAnonymously] = useState(false);

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
      toolbarSecondary: (
        <p className="text-sm text-text-muted">New message to {adminTitle}</p>
      ),
    }),
    [adminTitle],
  );
  usePageHeader(headerConfig);

  const foreignKey = user?.id != null ? String(user.id) : "";

  return (
    <PageContainer className="flex min-h-[min(70vh,720px)] w-full min-w-0 flex-col">
      <div className="border-b border-border px-4 py-4">
        <p className="text-sm font-medium text-text-primary">{adminTitle}</p>
        <p className="text-xs text-text-muted">
          Describe your parent&apos;s concern. You can attach photos or documents.
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-text-primary">Hide your name from school staff</p>
            <p className="text-xs text-text-muted">
              You can still follow this complaint here.
            </p>
          </div>
          <Switch
            checked={fileAnonymously}
            onCheckedChange={setFileAnonymously}
            disabled={createComplaint.isPending}
            aria-label="File anonymously"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end p-4">
        <ComplaintComposer
          foreignKey={foreignKey}
          placeholder="What would your parent like the school to know?"
          isSending={createComplaint.isPending}
          disabled={createComplaint.isPending}
          onSend={async (input) => {
            const issue = await createComplaint.mutateAsync({
              ...input,
              is_anonymous: fileAnonymously,
            });
            router.push(`/complaints/${issue.id}`);
          }}
        />
      </div>
    </PageContainer>
  );
}
