"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { DenyLeaveDialog } from "@/components/leave-requests/deny-leave-dialog";
import { LeaveRequestAttachment as LeaveRequestAttachmentPreview } from "@/components/leave-requests/leave-request-attachment";
import { PageContainer } from "@/components/layout/page-container";
import { AlertDialog, Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import {
  LeaveRequestStatus,
  type LeaveRequest,
  type LeaveRequestAttachment,
} from "@/sdk/_types/leave-requests";
import {
  useApproveLeaveRequest,
  useDenyLeaveRequest,
  useLeaveRequestDetail,
} from "@/sdk/hooks/leave-requests";
import { ArrowLeft } from "iconoir-react";

function formatDateRange(start: string, end: string): string {
  if (start === end) return start;
  return `${start} – ${end}`;
}

function expandedName(value: unknown): string | null {
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name: string }).name);
  }
  return null;
}

function resolveLeaveAttachment(
  attachment: LeaveRequest["attachment"],
): LeaveRequestAttachment | null {
  if (!attachment) return null;
  if (typeof attachment === "number") return { id: attachment };
  return attachment;
}

export default function LeaveRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const detail = useLeaveRequestDetail(Number.isFinite(id) ? id : null);
  const approve = useApproveLeaveRequest();
  const deny = useDenyLeaveRequest();
  const [denyOpen, setDenyOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);

  const row = detail.data;
  const isPending = row?.status === LeaveRequestStatus.Pending;
  const isBusy = approve.isPending || deny.isPending;

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Leave request</h1>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer width="narrow">
      <div className="flex flex-col gap-6 py-6">
        <Link
          href="/leave-requests"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          Leave requests
        </Link>

        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Loading…
          </p>
        ) : null}

        {detail.isError || !row ? (
          <p className="text-sm text-destructive">Leave request not found.</p>
        ) : null}

        {row ? (
          <article className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-text-primary">
                {expandedName(row.student) ?? "Student"}
              </span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {row.status}
              </span>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dates
              </p>
              <p className="text-sm text-text-primary">
                {formatDateRange(row.start_date, row.end_date)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Reason
              </p>
              <p className="whitespace-pre-wrap text-sm text-text-primary">
                {row.reason}
              </p>
            </div>

            {resolveLeaveAttachment(row.attachment) ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Attachment
                </p>
                <LeaveRequestAttachmentPreview
                  attachment={resolveLeaveAttachment(row.attachment)!}
                />
              </div>
            ) : null}

            {row.denial_reason ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Denial reason
                </p>
                <p className="whitespace-pre-wrap text-sm text-text-primary">
                  {row.denial_reason}
                </p>
              </div>
            ) : null}

            {expandedName(row.reviewed_by) ? (
              <p className="text-sm text-muted-foreground">
                Reviewed by {expandedName(row.reviewed_by)}
                {row.reviewed_at ? ` · ${row.reviewed_at}` : null}
              </p>
            ) : null}

            {isPending ? (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  isLoading={approve.isPending}
                  disabled={isBusy}
                  onClick={() => setApproveOpen(true)}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => setDenyOpen(true)}
                >
                  Deny
                </Button>
              </div>
            ) : null}
          </article>
        ) : null}
      </div>

      <AlertDialog.Root open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Approve leave?</AlertDialog.Title>
            <AlertDialog.Description>
              The student will be marked absent on all class sessions for these
              dates.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Close
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={approve.isPending}
                  />
                }
              >
                Cancel
              </AlertDialog.Close>
              <Button
                type="button"
                isLoading={approve.isPending}
                disabled={approve.isPending}
                onClick={() => {
                  approve.mutate(id, {
                    onSuccess: () => setApproveOpen(false),
                  });
                }}
              >
                Approve
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <DenyLeaveDialog
        open={denyOpen}
        isLoading={deny.isPending}
        onOpenChange={setDenyOpen}
        onConfirm={(denial_reason) => {
          deny.mutate(
            { id, denial_reason },
            { onSuccess: () => setDenyOpen(false) },
          );
        }}
      />
    </PageContainer>
  );
}
