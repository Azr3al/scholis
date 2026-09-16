"use client";

import { OpenNewWindow, WarningTriangle } from "iconoir-react";

import { Button } from "@/components/primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/courses/ui/table";
import type { ScholisPaperLink } from "@/types/scholis";

/**
 * The papers this course has bound, and where their marks land.
 *
 * The "Waiting to be placed" state is surfaced rather than hidden because it is
 * the one that looks like a missing mark later. Marks for an unplaced paper are
 * stored here — nothing is lost — but they are not in the gradebook, and a teacher
 * scanning the results grid would otherwise have no way to know why.
 */
type Props = {
  papers: ScholisPaperLink[];
  canManage: boolean;
  canLaunch: boolean;
  onLaunch: (paper: ScholisPaperLink) => void;
  onRelink: (paper: ScholisPaperLink) => void;
};

export function ScholisPapersTable({
  papers,
  canManage,
  canLaunch,
  onLaunch,
  onRelink,
}: Props) {
  if (papers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-text-muted">
        No Scholis papers are linked to this course yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Paper</TableHead>
            <TableHead>Lands in</TableHead>
            <TableHead className="text-right">Max</TableHead>
            <TableHead className="text-right">Marks stored</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {papers.map((paper) => (
            <TableRow key={paper.id}>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-text-primary">
                    {paper.scholis_test_title || "Untitled paper"}
                  </span>
                  <span className="font-mono text-xs text-text-muted">
                    {paper.scholis_test_id}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {paper.column ? (
                  <span className="text-sm text-text-primary">
                    {paper.column.title}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-danger">
                    <WarningTriangle className="size-3.5 shrink-0" aria-hidden />
                    Waiting to be placed
                  </span>
                )}
                {!paper.is_active ? (
                  <span className="ml-2 rounded-full border border-border bg-surface-hover px-2 py-0.5 text-xs text-text-muted">
                    inactive
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {paper.max_score ?? "—"}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {paper.score_count}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  {canLaunch ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onLaunch(paper)}
                      disabled={!paper.is_active}
                    >
                      <OpenNewWindow className="size-3.5" aria-hidden />
                      Launch
                    </Button>
                  ) : null}
                  {canManage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRelink(paper)}
                    >
                      Move
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
