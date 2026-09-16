"use client";

import type { RefObject } from "react";

import type { CellResolution } from "@/lib/imports/resolution";
import type { CourseRosterStudent } from "@/lib/mark-sheets-api";

import {
  AnchoredImportPopover,
  type MatchAnchorRect,
} from "@/components/import-grid/user-match/anchored-import-popover";
import { UserMatchPopoverContent } from "@/components/import-grid/user-match/user-match-popover-content";

export type MarkSheetStudentMatchTarget = {
  sourceRow: number;
  anchorCol: number;
  rawEmail: string;
  importedName?: string;
  rect: MatchAnchorRect;
  cell: CellResolution;
  field: string;
};

type Props = {
  target: MarkSheetStudentMatchTarget | null;
  overlayRef?: RefObject<HTMLDivElement | null>;
  rosterStudents: CourseRosterStudent[];
  onResolve: (next: CellResolution) => void;
  onClose: () => void;
};

export function MarkSheetStudentMatchPopover({
  target,
  overlayRef,
  rosterStudents,
  onResolve,
  onClose,
}: Props) {
  return (
    <AnchoredImportPopover
      variant="fixed"
      rect={target?.rect ?? null}
      open={Boolean(target)}
      onClose={onClose}
      overlayRef={overlayRef}
      popupClassName="click-outside-ignore fixed left-0 top-0 z-dropdown w-72 max-w-[min(18rem,calc(100vw-1rem))] rounded-md border border-border bg-surface-elevated p-2 text-text-primary shadow-md"
      popupStyle={{ willChange: "transform" }}
      dataAttributes={{ "data-mark-sheet-student-match-popover": true }}
    >
      {target ? (
        <UserMatchPopoverContent
          mode="roster"
          cell={target.cell}
          rawEmail={target.rawEmail}
          importedName={target.importedName}
          rosterStudents={rosterStudents}
          onResolve={onResolve}
          onClose={onClose}
        />
      ) : null}
    </AnchoredImportPopover>
  );
}
