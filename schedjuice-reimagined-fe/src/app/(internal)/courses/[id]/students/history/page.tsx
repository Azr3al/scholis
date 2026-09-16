"use client";
import { AlertDialog, Button, Input, Skeleton } from "@/components/primitives";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { NavArrowRight, NavArrowLeft } from "iconoir-react";

import { Badge } from "@/components/courses/ui/badge";
import { FormSaveTick } from "@/components/product-docs/form-save-tick";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/courses/ui/table";
import { useCourseHub } from "@/contexts/course-hub-context";
import { canManageCourseRoster, isStudent } from "@/helpers/authorization";
import { buildUserProfileHref } from "@/helpers/course/roster-table-utils";
import { formatDate } from "@/helpers/date";
import { getCreatedByIdFromCourse } from "@/helpers/course-hub";
import { useCourseStudentRoster } from "@/hooks/use-course-student-roster";
import { useUser } from "@/hooks/useUser";
import { axiosClient } from "@/lib/api";
import { cn } from "@/lib/utils";

type MembershipHistoryRow = {
  id: number;
  event_type: "joined" | "removed";
  occurred_at: string;
  user: { id: number; name: string; email: string };
  actor: { id: number; name: string } | null;
  can_re_enroll?: boolean;
};

type MembershipHistoryResponse = {
  data: {
    results: MembershipHistoryRow[];
    count: number;
  };
};

const PAGE_SIZE = 50;
const TICK_MS = 2000;

export default function CourseStudentsHistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { courseId, course, isCourseLoading, teacherMemberIds } = useCourseHub();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reEnrollTarget, setReEnrollTarget] =
    useState<MembershipHistoryRow | null>(null);
  const [showReEnrolledTick, setShowReEnrolledTick] = useState(false);
  const reEnrolledTickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const canViewHistory = Boolean(
    user &&
      course &&
      canManageCourseRoster(
        user,
        teacherMemberIds,
        getCreatedByIdFromCourse(course),
      ),
  );

  const numericCourseId = Number(courseId);
  const { reEnrollStudent, isPending } = useCourseStudentRoster(
    Number.isFinite(numericCourseId) ? numericCourseId : undefined,
  );

  const historyQuery = useQuery({
    queryKey: ["courseMembershipHistory", courseId, page],
    enabled: Boolean(courseId && canViewHistory),
    queryFn: async () => {
      const { data } = await axiosClient.get<MembershipHistoryResponse>(
        `courses/${courseId}/students/membership-history`,
        { params: { page, page_size: PAGE_SIZE } },
      );
      return data.data;
    },
  });

  const flashReEnrolledTick = useCallback(() => {
    if (reEnrolledTickTimerRef.current) {
      clearTimeout(reEnrolledTickTimerRef.current);
    }
    setShowReEnrolledTick(true);
    reEnrolledTickTimerRef.current = setTimeout(
      () => setShowReEnrolledTick(false),
      TICK_MS,
    );
  }, []);

  useEffect(() => {
    return () => {
      if (reEnrolledTickTimerRef.current) {
        clearTimeout(reEnrolledTickTimerRef.current);
      }
    };
  }, []);

  const filteredRows = useMemo(() => {
    const rows = historyQuery.data?.results ?? [];
    const q = search.trim().toLowerCase();
    if (!q) {
      return rows;
    }
    return rows.filter((row) => {
      const haystack = `${row.user.name} ${row.user.email}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [historyQuery.data?.results, search]);

  const totalCount = historyQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  if (isCourseLoading) {
    return <Skeleton className="min-h-[200px] w-full rounded-xl" aria-busy />;
  }

  if (!user) {
    return null;
  }

  if (!canViewHistory) {
    return (
      <p className="text-sm text-text-secondary" role="alert">
        You do not have access to membership history for this course.
      </p>
    );
  }

  if (!course.id) {
    return (
      <p className="text-sm text-text-secondary" role="alert">
        Course could not be loaded.
      </p>
    );
  }

  const hideProfileLink = isStudent(user);

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium uppercase tracking-wide text-text-secondary">
            Membership history
          </p>
          <FormSaveTick visible={showReEnrolledTick} label="Re-enrolled" />
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email (current page)"
          className="w-full"
        />
        {historyQuery.isLoading ? (
          <Skeleton className="min-h-[200px] w-full rounded-xl" aria-busy />
        ) : historyQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Could not load membership history.
          </p>
        ) : totalCount === 0 ? (
          <p className="text-sm text-text-secondary">No membership events yet.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                  {!hideProfileLink ? <TableHead className="w-10" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={hideProfileLink ? 6 : 7}
                      className="text-text-secondary"
                    >
                      No matches on this page.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const href = hideProfileLink
                      ? null
                      : buildUserProfileHref(
                          row.user.id,
                          pathname,
                          typeof window !== "undefined"
                            ? window.location.search
                            : "",
                        );
                    return (
                      <TableRow
                        key={row.id}
                        className={cn(href && "cursor-pointer hover:bg-surface-hover")}
                        onClick={href ? () => router.push(href) : undefined}
                      >
                        <TableCell className="font-medium">{row.user.name}</TableCell>
                        <TableCell className="text-text-secondary">
                          {row.user.email}
                        </TableCell>
                        <TableCell>
                          {row.event_type === "removed" ? (
                            <Badge variant="outline" className="font-normal">
                              Removed
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="font-normal">
                              Joined
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(row.occurred_at)}</TableCell>
                        <TableCell className="text-text-secondary">
                          {row.actor?.name ?? "—"}
                        </TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          {row.can_re_enroll ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={isPending}
                              onClick={() => setReEnrollTarget(row)}
                            >
                              Re-enroll
                            </Button>
                          ) : null}
                        </TableCell>
                        {!hideProfileLink ? (
                          <TableCell className="text-text-secondary">
                            <NavArrowRight className="h-4 w-4" aria-hidden />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            {totalPages > 1 ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-text-secondary">
                  Page {page} of {totalPages} ({totalCount} events)
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    <NavArrowLeft className="mr-1 h-4 w-4" aria-hidden />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                  >
                    Next
                    <NavArrowRight className="ml-1 h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <AlertDialog.Root
        open={reEnrollTarget !== null}
        onOpenChange={(open) => {
          if (!open && reEnrollStudent.isPending) {
            return;
          }
          if (!open) {
            setReEnrollTarget(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup className="w-full max-w-md">
            <AlertDialog.Title>Re-enroll student?</AlertDialog.Title>
            <AlertDialog.Description>
              {reEnrollTarget
                ? `${reEnrollTarget.user.name} will be added back to this class roster.`
                : null}
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Close
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={reEnrollStudent.isPending}
                  >
                    Cancel
                  </Button>
                }
              />
              <Button
                type="button"
                isLoading={reEnrollStudent.isPending}
                disabled={reEnrollStudent.isPending || !reEnrollTarget}
                onClick={() => {
                  if (!reEnrollTarget) {
                    return;
                  }
                  reEnrollStudent.mutate(reEnrollTarget.user.id, {
                    onSuccess: () => {
                      setReEnrollTarget(null);
                      flashReEnrolledTick();
                      void historyQuery.refetch();
                    },
                  });
                }}
              >
                Re-enroll
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
