"use client";

import { PageContainer } from "@/components/layout/page-container";
import { deleteEntity, fetchEntity } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import { describePaymentCoverageDisplay } from "@/helpers/payment-coverage-months";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { PaymentCoverageEditDialog } from "@/components/finances/payment-coverage-edit-dialog";
import {
  AlertDialog,
  Button,
  Skeleton,
  buttonVariants,
} from "@/components/primitives";
// No table primitive yet — keep deferred ui/table for review grid chrome.
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/_chrome/table";
// Legacy toast API (title/description/variant) — primitive useToast is incompatible.
import { useToast } from "@/components/primitives";
import { invalidateUserPaymentsCaches } from "@/lib/finances/invalidate-user-payments-caches";
import { queryClient } from "@/lib/query";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useState } from "react";

type CoverageReviewCourse = {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
};

type CoverageReviewPayload = {
  multi_month_payments: Array<{
    id: number;
    status: string;
    issued_at: string | null;
    user: { id: number; name: string };
    course: CoverageReviewCourse;
    covered_months: { year: number; month_index: number }[];
  }>;
};

type CoverageEditState = {
  paymentIds: number[];
  courseStartDate: string | null;
  courseEndDate: string | null;
};

function CoverageReviewInner() {
  const toast = useToast();
  const [courseId] = useQueryState("courseId", parseAsString.withDefault(""));
  const [coverageEdit, setCoverageEdit] = useState<CoverageEditState | null>(
    null,
  );
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<
    number | null
  >(null);
  const params =
    courseId.trim() && isValidApiEntityIdParam(courseId.trim())
      ? { course_id: courseId.trim() }
      : undefined;

  const isCourseScoped = Boolean(
    courseId.trim() && isValidApiEntityIdParam(courseId.trim()),
  );

  const courseHeaderQuery = useQuery({
    queryKey: ["coverage-review-course-header", courseId],
    enabled: isCourseScoped,
    queryFn: async () => {
      const id = Number(courseId.trim());
      const res = await fetchEntity("courses", id, []);
      const body = res.data as {
        isError?: boolean;
        message?: string;
        data?: { title: string };
      };
      if (body.isError || body.data == null) {
        throw new Error(body.message ?? "Could not load course.");
      }
      return body.data;
    },
  });

  const query = useQuery({
    queryKey: ["user-payments-coverage-review", courseId],
    queryFn: async () => {
      const res = await axiosClient.get<{
        isError: boolean;
        message?: string;
        data?: CoverageReviewPayload;
      }>("user-payments/coverage-review", { params });
      if (res.data.isError) {
        throw new Error(res.data.message ?? "Could not load review data.");
      }
      const payload = res.data.data;
      if (!payload) {
        throw new Error("Unexpected empty response.");
      }
      return payload;
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: number) =>
      deleteEntity("user-payments", paymentId),
    onSuccess: () => {
      toast.add({ description: "Payment deleted." });
      setConfirmDeletePaymentId(null);
      void query.refetch();
      void queryClient.invalidateQueries({
        queryKey: ["user-payments-coverage-review"],
      });
      void invalidateUserPaymentsCaches(queryClient);
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof Error ? e.message : "Could not delete payment.";
      toast.add({ description: msg });
    },
  });

  const backHref = courseId.trim()
    ? `/finances/student-payments?courseId=${encodeURIComponent(courseId.trim())}`
    : "/finances/student-payments";

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-3 py-6">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        Student payments
      </Link>

      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">
          Payments to review
        </h1>
        <p className="max-w-2xl text-sm text-text-secondary">
          Rows where one payment covers multiple calendar months (explicit
          coverage).
        </p>
      </div>

      {isCourseScoped ? (
        courseHeaderQuery.isLoading ? (
          <div className="flex w-full max-w-3xl flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-64 max-w-full" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
        ) : courseHeaderQuery.isError ? (
          <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
            Could not load course title for ID{" "}
            <span className="font-mono">{courseId.trim()}</span>.
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Course
              </p>
              <p className="text-lg font-semibold leading-snug text-text-primary">
                {courseHeaderQuery.data.title}
              </p>
              <p className="text-xs text-text-muted">
                ID{" "}
                <span className="font-mono tabular-nums">{courseId.trim()}</span>
              </p>
            </div>
            <Link
              href={`/courses/${courseId.trim()}`}
              className={cn(
                buttonVariants({ variant: "primary", size: "sm"  }),
                "shrink-0 self-start no-underline sm:self-center",
                "inline-flex gap-1.5",
              )}
            >
              Course details
              <NavArrowRight
                className="size-3.5 shrink-0 opacity-90"
                aria-hidden
              />
            </Link>
          </div>
        )
      ) : (
        <p className="text-sm text-text-secondary">All courses in this school.</p>
      )}

      {query.isLoading ? (
        <div className="space-y-8" aria-busy="true">
          <section className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <TableSkeleton columns={5} rows={4} />
          </section>
        </div>
      ) : query.isError ? (
        <p className="text-sm text-danger" role="alert">
          {query.error instanceof Error
            ? query.error.message
            : "Could not load data."}
        </p>
      ) : (
        <>
          <AlertDialog.Root
            open={confirmDeletePaymentId !== null}
            onOpenChange={(open) => {
              if (!open) setConfirmDeletePaymentId(null);
            }}
          >
            <AlertDialog.Portal>
              <AlertDialog.Backdrop />
              <AlertDialog.Popup>
                <AlertDialog.Title>Delete this payment?</AlertDialog.Title>
                <AlertDialog.Description>
                  This removes the payment record for this student. You can add a
                  new payment from the student payments report if needed.
                </AlertDialog.Description>
                <div className="flex justify-end gap-2">
                  <AlertDialog.Close
                    render={<Button variant="ghost">Cancel</Button>}
                  />
                  <Button
                    type="button"
                    variant="danger"
                    isLoading={deletePaymentMutation.isPending}
                    disabled={confirmDeletePaymentId === null}
                    onClick={() => {
                      if (confirmDeletePaymentId != null) {
                        deletePaymentMutation.mutate(confirmDeletePaymentId);
                      }
                    }}
                  >
                    Delete payment
                  </Button>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>

          <PaymentCoverageEditDialog
            open={coverageEdit !== null}
            onOpenChange={(open) => {
              if (!open) setCoverageEdit(null);
            }}
            paymentIds={coverageEdit?.paymentIds ?? []}
            courseStartDate={coverageEdit?.courseStartDate}
            courseEndDate={coverageEdit?.courseEndDate}
            onSaved={() => void query.refetch()}
          />
          <section className="space-y-3">
            <h2 className="text-lg font-medium">
              Multi-month payments ({query.data.multi_month_payments.length})
            </h2>
            {query.data.multi_month_payments.length === 0 ? (
              <p className="text-sm text-text-muted">None.</p>
            ) : (
              <div className="min-w-0 overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[10rem] align-middle">
                        Student
                      </TableHead>
                      {!isCourseScoped ? (
                        <TableHead className="align-middle">Course</TableHead>
                      ) : null}
                      <TableHead className="whitespace-nowrap align-middle">
                        Status
                      </TableHead>
                      <TableHead className="align-middle">Months covered</TableHead>
                      <TableHead className="text-right align-middle">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.multi_month_payments.map((row) => (
                      <TableRow key={row.id} className="align-middle">
                        <TableCell className="align-middle">
                          {row.user.name}
                        </TableCell>
                        {!isCourseScoped ? (
                          <TableCell className="align-middle">
                            {row.course.title}
                          </TableCell>
                        ) : null}
                        <TableCell className="align-middle whitespace-nowrap">
                          {row.status}
                        </TableCell>
                        <TableCell className="align-middle max-w-[min(28rem,55vw)] text-sm leading-snug text-text-secondary">
                          {describePaymentCoverageDisplay({
                            covered_months: row.covered_months,
                            issued_at: row.issued_at,
                            course_start_date: row.course.start_date,
                            course_end_date: row.course.end_date,
                          })}
                        </TableCell>
                        <TableCell className="align-middle text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setCoverageEdit({
                                  paymentIds: [row.id],
                                  courseStartDate: row.course.start_date,
                                  courseEndDate: row.course.end_date,
                                })
                              }
                            >
                              Edit coverage
                            </Button>
                            <Link
                              href={`/finances/student-payments?courseId=${row.course.id}&date=${encodeURIComponent(
                                row.issued_at ?? new Date().toISOString(),
                              )}`}
                              className="inline-flex items-center text-sm text-accent underline-offset-4 hover:underline"
                            >
                              Open report
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function CoverageReviewPage() {
  return  (
<PageContainer width="wide">
<Suspense
      fallback={
        <div className="mx-auto max-w-5xl space-y-8 px-3 py-6" aria-busy="true">
          <Skeleton className="h-6 w-32" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-full max-w-2xl" />
          </div>
          <TableSkeleton columns={5} rows={4} />
        </div>
      }
    >
      <CoverageReviewInner />
    </Suspense>
</PageContainer>
);
}
