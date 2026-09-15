"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/courses/ui/table";
import { formatDate } from "@/helpers/date";
import type { ScholisScore } from "@/types/scholis";

/**
 * Released marks, as stored here.
 *
 * Both the exact figure and the rounded integer the gradebook holds are shown
 * side by side, because the two are not the same number and pretending otherwise
 * is how a disputed report card starts. Showing them in adjacent columns beats
 * hiding one behind a tooltip: the relationship is visible without being asked
 * for, and there is nothing to discover on a touch screen.
 */
type Props = {
  scores: ScholisScore[];
  /** Name lookup for a student id, from the course roster. */
  studentName: (studentId: number | null) => string | null;
};

export function ScholisScoresTable({ scores, studentName }: Props) {
  if (scores.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-text-muted">
        No released marks yet. Marks arrive automatically when a teacher releases
        results at Scholis.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead className="text-right">Exact</TableHead>
            <TableHead className="text-right">In gradebook</TableHead>
            <TableHead>Released</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scores.map((score) => {
            const name = studentName(score.student_id);
            return (
              <TableRow key={score.attempt_id}>
                <TableCell>
                  {name ? (
                    <span className="text-sm text-text-primary">{name}</span>
                  ) : (
                    // Not an error state: a walk-in attempt has marks and no
                    // student of ours to attribute them to. Saying so is better
                    // than showing a blank cell that looks like a bug.
                    <span
                      className="text-sm text-text-muted"
                      title={
                        score.taker_name
                          ? `“${score.taker_name}” sat this without being launched from here, so there is no student to attribute it to.`
                          : "This attempt has no student of ours attached to it."
                      }
                    >
                      Unattributed
                      {score.taker_name ? ` · ${score.taker_name}` : ""}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-text-primary">
                  {score.score}
                  <span className="text-text-muted"> / {score.max_score}</span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {score.synced_marks === null ? (
                    <span className="text-danger">not written</span>
                  ) : (
                    <span
                      className="text-text-primary"
                      title={`Rounded from ${score.score} (half-up).`}
                    >
                      {score.synced_marks}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-text-muted">
                  {score.released_at ? formatDate(score.released_at) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
