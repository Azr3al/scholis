"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  Button,
  Combobox,
  Dialog,
  Field,
  useToast,
} from "@/components/primitives";
import { MintedLink } from "@/components/scholis/minted-link";
import { listCourseRosterStudents } from "@/lib/mark-sheets-api";
import { mintScholisLaunch, scholisErrorMessage } from "@/lib/scholis-api";
import type { ScholisLaunchTicket, ScholisPaperLink } from "@/types/scholis";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  /** Papers this course has bound. Only placed papers make sense to launch into. */
  papers: ScholisPaperLink[];
  /** Preselect a paper when launched from that paper's row. */
  initialPaperId?: number;
};

/**
 * Mint a one-time link admitting one student to one paper.
 *
 * The student picker is fed from the course roster and the paper picker from this
 * course's bindings, so neither can be typed freehand. That is not just
 * convenience: ``takerRef`` is what comes back on the released score row, so a
 * hand-typed id would produce a mark that cannot be attributed to anybody, and a
 * hand-typed paper id would admit a student to a paper belonging to another
 * course.
 */
export function ScholisLaunchDialog({
  open,
  onOpenChange,
  courseId,
  papers,
  initialPaperId,
}: Props) {
  const toast = useToast();
  const [studentId, setStudentId] = useState<string>("");
  const [paperId, setPaperId] = useState<string>("");
  const [ticket, setTicket] = useState<ScholisLaunchTicket | null>(null);

  const roster = useQuery({
    queryKey: ["course-roster", courseId],
    queryFn: () => listCourseRosterStudents(courseId),
    enabled: open,
  });

  // Reopening the dialog is a fresh mint, not a continuation of the last one. A
  // stale ticket left on screen invites somebody to reuse a link that has already
  // been spent or has expired.
  useEffect(() => {
    if (!open) {
      setTicket(null);
      return;
    }
    if (initialPaperId) setPaperId(String(initialPaperId));
  }, [open, initialPaperId]);

  const studentItems = useMemo(
    () =>
      (roster.data ?? []).map((student) => ({
        value: String(student.id),
        label: student.code ? `${student.name} (${student.code})` : student.name,
      })),
    [roster.data],
  );

  // Only active bindings. A deactivated paper is one a teacher deliberately took
  // out of use, and launching into it would put marks somewhere they no longer go.
  const paperItems = useMemo(
    () =>
      papers
        .filter((paper) => paper.is_active)
        .map((paper) => ({
          value: String(paper.id),
          label: paper.scholis_test_title || paper.scholis_test_id,
        })),
    [papers],
  );

  const selectedStudent = (roster.data ?? []).find(
    (student) => String(student.id) === studentId,
  );

  const mint = useMutation({
    mutationKey: ["scholis", "launch"],
    mutationFn: () =>
      mintScholisLaunch({
        student_id: Number(studentId),
        paper_link_id: Number(paperId),
      }),
    onSuccess: (result) => {
      setTicket(result);
      toast.add({
        title: "Launch link ready",
        description: selectedStudent ? `For ${selectedStudent.name}.` : undefined,
      });
    },
    onError: (error) => {
      setTicket(null);
      toast.add({
        title: "No link was created",
        description: scholisErrorMessage(error, "Scholis did not return a launch link."),
      });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!studentId || !paperId) return;
    mint.mutate();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Launch a student into a paper</Dialog.Title>
          <Dialog.Description>
            Creates a single-use link that admits one student to one paper. The
            link is not stored anywhere, so this is the only copy.
          </Dialog.Description>

          {ticket ? (
            <div className="mt-4 space-y-4">
              <MintedLink
                url={ticket.url}
                expiresAt={ticket.expires_at}
                subject={selectedStudent?.name ?? "that student"}
                copiedTitle="Launch link copied."
                ariaLabel="Student launch link"
              />
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTicket(null);
                    setStudentId("");
                  }}
                >
                  Launch another student
                </Button>
                <Dialog.Close
                  render={
                    <Button type="button" variant="secondary" size="sm">
                      Done
                    </Button>
                  }
                />
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4">
              <Field.Root>
                <Field.Label>Student</Field.Label>
                <Combobox
                  items={studentItems}
                  value={studentId}
                  onValueChange={(value) => setStudentId(value == null ? "" : String(value))}
                  placeholder={
                    roster.isLoading ? "Loading roster…" : "Search the roster…"
                  }
                  emptyMessage="No student matches that."
                  size="full"
                />
                <Field.Description>
                  From this course&apos;s roster. The student&apos;s own id is sent
                  to Scholis as the taker reference, which is what makes the
                  released mark come back attributable.
                </Field.Description>
              </Field.Root>

              <Field.Root>
                <Field.Label>Paper</Field.Label>
                <Combobox
                  items={paperItems}
                  value={paperId}
                  onValueChange={(value) => setPaperId(value == null ? "" : String(value))}
                  placeholder={
                    paperItems.length === 0
                      ? "No linked papers yet"
                      : "Search linked papers…"
                  }
                  emptyMessage="No paper matches that."
                  size="full"
                />
                <Field.Description>
                  {paperItems.length === 0
                    ? "Link a paper to this course first."
                    : "Only papers linked to this course are offered."}
                </Field.Description>
              </Field.Root>

              <div className="flex justify-end gap-2 pt-1">
                <Dialog.Close
                  render={
                    <Button type="button" variant="ghost" size="sm">
                      Cancel
                    </Button>
                  }
                />
                <Button
                  type="submit"
                  size="sm"
                  isLoading={mint.isLoading}
                  disabled={!studentId || !paperId}
                >
                  Create launch link
                </Button>
              </div>
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
