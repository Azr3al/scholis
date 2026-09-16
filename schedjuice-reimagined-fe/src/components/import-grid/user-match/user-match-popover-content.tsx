"use client";

import type { CellResolution } from "@/lib/imports/resolution";
import {
  confirmUserMatch,
  ignoreUserRow,
  pickRosterStudent,
  pickUserCandidate,
  rejectUserMatch,
  unignoreUserRow,
} from "@/lib/imports/resolution";
import type { CourseRosterStudent } from "@/lib/mark-sheets-api";
import { cn } from "@/lib/utils";

import { RosterStudentPicker } from "./roster-student-picker";
import { UserMatchAlternativesList } from "./user-match-alternatives-list";
import { UserMatchCurrentBlock } from "./user-match-current-block";
import { UserMatchFooterActions, type UserMatchFooterAction } from "./user-match-footer-actions";
import { UserMatchNameMismatchBanner } from "./user-match-name-mismatch-banner";
import { UserMatchSuggestedBlock } from "./user-match-suggested-block";

export type UserMatchPopoverMode = "org" | "roster";

type Props = {
  mode: UserMatchPopoverMode;
  cell: CellResolution;
  rawEmail: string;
  importedName?: string;
  rosterStudents?: CourseRosterStudent[];
  onResolve: (next: CellResolution) => void;
  onClose: () => void;
};

export function UserMatchPopoverContent({
  mode,
  cell,
  rawEmail,
  importedName,
  rosterStudents = [],
  onResolve,
  onClose,
}: Props) {
  const compact = mode === "roster";
  const candidates = cell.candidates ?? [];
  const isIgnored = cell.status === "ignored";
  const isConfirmed = cell.status === "confirmed";
  const showRosterPicker =
    mode === "roster" &&
    (cell.status === "new" ||
      cell.status === "ignored" ||
      cell.status === "pending_candidates" ||
      isConfirmed);
  const showAlternatives =
    candidates.length > 0 && !(mode === "roster" && showRosterPicker);

  const title =
    mode === "roster"
      ? isConfirmed
        ? `Matched · ${rawEmail || importedName || "row"}`
        : `Match · ${rawEmail || importedName || "row"}`
      : `Match for ${rawEmail}`;

  const footerActions: UserMatchFooterAction[] = [];

  if (mode === "roster") {
    if (isIgnored) {
      footerActions.push({
        label: "Un-ignore",
        variant: "ghost",
        onClick: () => {
          onResolve(unignoreUserRow());
          onClose();
        },
      });
    } else {
      footerActions.push({
        label: "Ignore this row",
        variant: "ghost",
        onClick: () => {
          onResolve(ignoreUserRow());
          onClose();
        },
      });
    }
  }

  if (cell.status === "pending_match") {
    footerActions.push({
      label: mode === "roster" ? "Leave unmatched" : "Create new",
      variant: "ghost",
      onClick: () => {
        onResolve(rejectUserMatch(cell));
        onClose();
      },
    });
    footerActions.push({
      label: "Confirm",
      variant: "primary",
      onClick: () => {
        onResolve(confirmUserMatch(cell));
        onClose();
      },
    });
  } else if (mode === "org") {
    footerActions.push({
      label: "Create new",
      variant: "ghost",
      onClick: () => {
        onResolve(rejectUserMatch(cell));
        onClose();
      },
    });
  }

  const rosterStudentById = new Map(rosterStudents.map((student) => [student.id, student]));

  return (
    <>
      <p
        className={cn(
          compact
            ? "mb-1.5 truncate text-[11px] text-text-secondary"
            : "mb-2 text-xs text-slate-500",
        )}
      >
        {title}
      </p>

      {cell.nameMismatch ? (
        <UserMatchNameMismatchBanner
          compact={compact}
          importedName={importedName}
          matchedLabel={cell.entityRef?.label}
          matchField={cell.matchField}
        />
      ) : null}

      {cell.status === "pending_match" && cell.entityRef ? (
        <UserMatchSuggestedBlock compact={compact} label={cell.entityRef.label} />
      ) : null}

      {mode === "roster" && isConfirmed && cell.entityRef ? (
        <UserMatchCurrentBlock label={cell.entityRef.label} />
      ) : null}

      {showAlternatives ? (
        <UserMatchAlternativesList
          compact={compact}
          candidates={candidates}
          onPick={(userId) => {
            onResolve(pickUserCandidate(cell, userId));
            onClose();
          }}
        />
      ) : null}

      {showRosterPicker ? (
        <div className={compact ? "mb-1.5" : "mb-2"}>
          <RosterStudentPicker
            rawEmail={rawEmail}
            importedName={importedName}
            candidates={candidates}
            rosterStudents={rosterStudents}
            compact={compact}
            onPickStudent={(studentId) => {
              const student = rosterStudentById.get(studentId);
              if (!student) return;
              onResolve(pickRosterStudent(cell, student));
              onClose();
            }}
          />
        </div>
      ) : null}

      <UserMatchFooterActions compact={compact} actions={footerActions} />
    </>
  );
}
