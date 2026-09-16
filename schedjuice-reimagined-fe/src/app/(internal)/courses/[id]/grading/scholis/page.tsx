"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Plus, Refresh, WarningTriangle } from "iconoir-react";

import { Button, Spinner, useToast } from "@/components/primitives";
import { ScholisLaunchDialog } from "@/components/scholis/launch-dialog";
import { ScholisLinkPaperDialog } from "@/components/scholis/link-paper-dialog";
import { ScholisPapersTable } from "@/components/scholis/papers-table";
import { ScholisScoresTable } from "@/components/scholis/scores-table";
import { usePermissions } from "@/hooks/usePermissions";
import { listCourseRosterStudents } from "@/lib/mark-sheets-api";
import {
  getScholisConnection,
  listScholisPapers,
  listScholisScores,
  scholisErrorMessage,
  syncScholisScores,
} from "@/lib/scholis-api";
import type { ScholisPaperLink, ScholisSyncReport } from "@/types/scholis";

/**
 * Scholis inside a course's grading area.
 *
 * Reading needs ``grade.manage`` or ``grade.view_all``, matching how the rest of
 * the gradebook is gated. Placing a paper needs ``grade.manage`` because it
 * decides which column a class's marks land in. Launching needs ``quiz.author``,
 * the permission the rest of assessment administration already uses.
 */
export default function CourseScholisPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();

  const canManage = can("grade.manage");
  const canView = canManage || can("grade.view_all");
  const canLaunch = can("quiz.author");

  const [linkOpen, setLinkOpen] = useState(false);
  const [relinkPaper, setRelinkPaper] = useState<ScholisPaperLink | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchPaperId, setLaunchPaperId] = useState<number | undefined>();
  const [report, setReport] = useState<ScholisSyncReport | null>(null);

  const connection = useQuery({
    queryKey: ["scholis", "connection"],
    queryFn: getScholisConnection,
    enabled: canView,
  });

  const papers = useQuery({
    queryKey: ["scholis", "papers", id],
    queryFn: listScholisPapers,
    enabled: canView && Boolean(connection.data?.connected),
  });

  const scores = useQuery({
    queryKey: ["scholis", "scores", id],
    queryFn: () => listScholisScores({ course_ref: id }),
    enabled: canView && Boolean(connection.data?.connected),
  });

  const roster = useQuery({
    queryKey: ["course-roster", id],
    queryFn: () => listCourseRosterStudents(id),
    enabled: canView,
  });

  const sync = useMutation({
    mutationKey: ["scholis", "sync", id],
    mutationFn: () => syncScholisScores({ course_ref: id }),
    onSuccess: (result) => {
      setReport(result);
      // A sync can move marks into the gradebook, so the results grid has to be
      // re-read rather than trusted from cache.
      void queryClient.invalidateQueries({ queryKey: ["scholis", "scores", id] });
      void queryClient.invalidateQueries({ queryKey: ["scholis", "papers", id] });
      void queryClient.invalidateQueries({ queryKey: ["result-sheets", id] });
      toast.add({
        title: result.ok ? "Marks pulled" : "Finished with problems",
        description: result.ok
          ? `${result.fetched} released, ${result.written_to_gradebook} written to the gradebook.`
          : `${result.errors.length} row${result.errors.length === 1 ? "" : "s"} could not be processed.`,
      });
    },
    onError: (error) => {
      toast.add({
        title: "Sync failed",
        description: scholisErrorMessage(error, "Could not reach Scholis."),
      });
    },
  });

  const studentName = useMemo(() => {
    const byId = new Map(
      (roster.data ?? []).map((student) => [student.id, student.name] as const),
    );
    return (studentId: number | null) =>
      studentId === null ? null : (byId.get(studentId) ?? null);
  }, [roster.data]);

  // Only this course's papers. The endpoint is tenant-wide because a paper is
  // bound once and can be reused, but this page is about one course.
  const coursePapers = useMemo(
    () => (papers.data ?? []).filter((paper) => paper.course_id === Number(id)),
    [papers.data, id],
  );

  if (!canView) {
    return (
      <div className="py-10 text-center text-sm text-text-muted">
        You do not have access to this course&apos;s grades.
      </div>
    );
  }

  const notConnected = connection.data ? !connection.data.connected : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl text-text-primary">Scholis papers</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Assessments run at Scholis; marks land in this course&apos;s gradebook.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={sync.isLoading}
              disabled={notConnected}
              onClick={() => sync.mutate()}
              title={
                notConnected
                  ? "This school is not connected to Scholis yet"
                  : "Pull released marks now"
              }
            >
              <Refresh className="size-4" aria-hidden />
              Sync now
            </Button>
          ) : null}
          {canManage ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={notConnected}
              onClick={() => {
                setRelinkPaper(null);
                setLinkOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              Link paper
            </Button>
          ) : null}
          {canLaunch && !notConnected ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setLaunchPaperId(undefined);
                setLaunchOpen(true);
              }}
            >
              Launch a student
            </Button>
          ) : null}
        </div>
      </div>

      {connection.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      ) : null}

      {notConnected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-start gap-2">
            <WarningTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <p className="text-sm text-text-secondary">
              This school is not connected to Scholis yet, so no marks can arrive.
            </p>
          </div>
          {can("organization.manage") ? (
            <Link
              href="/administration/scholis"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Connect this school
            </Link>
          ) : (
            <span className="text-sm text-text-muted">
              An administrator has to connect it first.
            </span>
          )}
        </div>
      ) : null}

      {report ? (
        <div className="rounded-xl border border-border/60 bg-surface-hover/20 p-4 text-sm">
          <p className="text-text-secondary">
            Pulled <strong className="text-text-primary">{report.fetched}</strong>{" "}
            released result{report.fetched === 1 ? "" : "s"}, stored{" "}
            <strong className="text-text-primary">{report.stored}</strong>, wrote{" "}
            <strong className="text-text-primary">{report.written_to_gradebook}</strong>{" "}
            to the gradebook.
          </p>
          {/* Skips are reported rather than swallowed. These two counts are the
              difference between "nothing was released" and "it was released and
              is waiting for somebody to act". */}
          {report.unlinked_papers > 0 || report.without_student > 0 ? (
            <ul className="mt-2 space-y-1 text-text-muted">
              {report.unlinked_papers > 0 ? (
                <li>
                  {report.unlinked_papers} result
                  {report.unlinked_papers === 1 ? "" : "s"} stored but not written —
                  the paper has no column yet.
                </li>
              ) : null}
              {report.without_student > 0 ? (
                <li>
                  {report.without_student} attempt
                  {report.without_student === 1 ? "" : "s"} had no student of ours to
                  attribute it to.
                </li>
              ) : null}
            </ul>
          ) : null}
          {report.errors.length > 0 ? (
            <ul className="mt-2 space-y-1 text-danger">
              {report.errors.slice(0, 5).map((error, index) => (
                <li key={index}>{error}</li>
              ))}
              {report.errors.length > 5 ? (
                <li>…and {report.errors.length - 5} more.</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      <section aria-label="Linked papers" className="space-y-3">
        <h2 className="text-base font-medium text-text-primary">Papers</h2>
        {papers.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        ) : (
          <ScholisPapersTable
            papers={coursePapers}
            canManage={canManage}
            canLaunch={canLaunch}
            onLaunch={(paper) => {
              setLaunchPaperId(paper.id);
              setLaunchOpen(true);
            }}
            onRelink={(paper) => {
              setRelinkPaper(paper);
              setLinkOpen(true);
            }}
          />
        )}
      </section>

      <section aria-label="Released marks" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-medium text-text-primary">Released marks</h2>
          <p className="text-xs text-text-muted">
            “Exact” is what Scholis reported. “In gradebook” is the integer written
            to the results grid, rounded half-up.
          </p>
        </div>
        {scores.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        ) : (
          <ScholisScoresTable scores={scores.data ?? []} studentName={studentName} />
        )}
      </section>

      <ScholisLinkPaperDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        courseId={id}
        key={relinkPaper?.id ?? "new"}
        initialTestId={relinkPaper?.scholis_test_id}
        initialSheetId={relinkPaper?.column?.sheet_id}
        initialColumnId={relinkPaper?.column?.id}
      />

      <ScholisLaunchDialog
        open={launchOpen}
        onOpenChange={setLaunchOpen}
        courseId={id}
        papers={coursePapers}
        initialPaperId={launchPaperId}
      />
    </div>
  );
}
