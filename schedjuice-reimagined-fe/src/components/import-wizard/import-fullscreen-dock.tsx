"use client";
import { Button, Sheet, buttonVariants } from "@/components/primitives";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { WarningTriangle as AlertTriangle, Copy, Settings as Settings2 } from "iconoir-react";

import type { ImportFieldDef } from "@/app/client-api/imports";
import { ImportCourseScopeSummary } from "@/components/import-grid/import-course-scope-summary";
import { NeedsAttentionPanel } from "@/components/import-grid/needs-attention-panel";
import { UserMatchesPanel } from "@/components/import-grid/user-matches-panel";
import { ValidationErrorsPanel } from "@/components/import-grid/validation-errors-panel";
import type { ImportGridFocusTarget } from "@/components/import-grid/import-data-grid";
import { DuplicateEmailsPanel } from "@/components/import-wizard/duplicate-emails-panel";
import { PasteImportRowPanel } from "@/components/import-wizard/paste-import-row-panel";
import { MicrosoftCreateToggle } from "@/components/microsoft/microsoft-create-toggle";
import type {
  CourseConflict,
  DuplicateEmailResolution,
  DuplicateEmailStrategy,
  UnresolvedTokenGroup,
} from "@/lib/imports/resolution";
import type { ImportValidationError } from "@/lib/imports/validation-errors";
import { cn } from "@/lib/utils";

type OpenSheet = "settings" | "duplicates" | "issues" | null;

interface ImportFullscreenDockProps {
  newUserCount: number;
  sendWelcomeEmails: boolean;
  onSendWelcomeEmailsChange: (checked: boolean) => void;
  showCourseScope: boolean;
  onCourseScopeChange?: () => void;
  duplicateEmailResolution: DuplicateEmailResolution | null;
  duplicateEmailStrategy: DuplicateEmailStrategy;
  onDuplicateEmailStrategyChange: (strategy: DuplicateEmailStrategy) => void;
  validationErrors: ImportValidationError[];
  fields: ImportFieldDef[];
  sessionErrorCount: number;
  validationPanelCollapsed: boolean;
  onValidationPanelToggle: () => void;
  focusTarget: ImportGridFocusTarget | null;
  onFocusError: (error: ImportValidationError) => void;
  unresolvedGroups: UnresolvedTokenGroup[];
  conflicts: CourseConflict[];
  courseProgress: { resolved: number; total: number };
  panelCollapsed: boolean;
  onPanelToggle: () => void;
  onResolve: (
    group: UnresolvedTokenGroup,
    rect: { x: number; y: number; width: number; height: number },
  ) => void;
  pendingExactMatchCount: number;
  pendingFuzzyMatchCount: number;
  onConfirmAllExactMatches: () => void;
  pasteHeaders?: string[];
  onPasteRowsAdded?: (rows: (string | null)[][]) => Promise<void>;
  pasteDisabled?: boolean;
}

function DockButton({
  label,
  active,
  badge,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm" variant="secondary" onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "relative size-9 border-border bg-background/95 shadow-sm backdrop-blur",
        active && "ring-2 ring-ring",
      )}
    >
      {children}
      {badge != null && badge > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Button>
  );
}

export function ImportFullscreenDock({
  newUserCount,
  sendWelcomeEmails,
  onSendWelcomeEmailsChange,
  showCourseScope,
  onCourseScopeChange,
  duplicateEmailResolution,
  duplicateEmailStrategy,
  onDuplicateEmailStrategyChange,
  validationErrors,
  fields,
  sessionErrorCount,
  validationPanelCollapsed,
  onValidationPanelToggle,
  focusTarget,
  onFocusError,
  unresolvedGroups,
  conflicts,
  courseProgress,
  panelCollapsed,
  onPanelToggle,
  onResolve,
  pendingExactMatchCount,
  pendingFuzzyMatchCount,
  onConfirmAllExactMatches,
  pasteHeaders,
  onPasteRowsAdded,
  pasteDisabled = false,
}: ImportFullscreenDockProps) {
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const autoOpenedIssuesRef = useRef(false);

  const duplicateCount = duplicateEmailResolution?.duplicateGroups.size ?? 0;
  const showDuplicates = duplicateCount > 0;
  const pendingMatchCount = pendingExactMatchCount + pendingFuzzyMatchCount;
  const issuesBadge =
    validationErrors.length +
    unresolvedGroups.length +
    conflicts.length +
    pendingMatchCount;
  const showIssues =
    validationErrors.length > 0 ||
    unresolvedGroups.length > 0 ||
    conflicts.length > 0 ||
    pendingMatchCount > 0 ||
    courseProgress.total > courseProgress.resolved;

  useEffect(() => {
    if (
      validationErrors.length > 0 &&
      !autoOpenedIssuesRef.current &&
      openSheet === null
    ) {
      autoOpenedIssuesRef.current = true;
      setOpenSheet("issues");
    }
  }, [validationErrors.length, openSheet]);

  const toggleSheet = (sheet: OpenSheet) => {
    setOpenSheet((current) => (current === sheet ? null : sheet));
  };

  return (
    <>
      <DockButton
        label="Settings"
        active={openSheet === "settings"}
        onClick={() => toggleSheet("settings")}
      >
        <Settings2 className="size-4" aria-hidden />
      </DockButton>

      {showDuplicates ? (
        <DockButton
          label="Duplicate emails"
          active={openSheet === "duplicates"}
          badge={duplicateCount}
          onClick={() => toggleSheet("duplicates")}
        >
          <Copy className="size-4" aria-hidden />
        </DockButton>
      ) : null}

      {showIssues ? (
        <DockButton
          label="Issues and course resolution"
          active={openSheet === "issues"}
          badge={issuesBadge}
          onClick={() => toggleSheet("issues")}
        >
          <AlertTriangle className="size-4" aria-hidden />
        </DockButton>
      ) : null}

      <Sheet.Root
        open={openSheet === "settings"}
        onOpenChange={(open) => setOpenSheet(open ? "settings" : null)}
      >
        <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup side="right" className="w-[min(24rem,90vw)] sm:max-w-none">
          <div>
            <Sheet.Title>Settings</Sheet.Title>
          </div>
          <div className="mt-6 space-y-6 overflow-y-auto pr-2">
            {pasteHeaders && onPasteRowsAdded ? (
              <PasteImportRowPanel
                headers={pasteHeaders}
                disabled={pasteDisabled}
                onRowsAdded={onPasteRowsAdded}
                className="border-0 shadow-none"
              />
            ) : null}
            {newUserCount > 0 ? (
              <MicrosoftCreateToggle
                checked={sendWelcomeEmails}
                onChange={onSendWelcomeEmailsChange}
                title="Send welcome emails"
                description={`Send login instructions to ${newUserCount} newly created user${newUserCount === 1 ? "" : "s"} when import completes. Existing linked users are not emailed.`}
              />
            ) : null}
            {showCourseScope ? (
              <ImportCourseScopeSummary onChange={onCourseScopeChange} />
            ) : null}
          </div>
        </Sheet.Popup>
      </Sheet.Portal>
      </Sheet.Root>

      {showDuplicates && duplicateEmailResolution ? (
        <Sheet.Root
          open={openSheet === "duplicates"}
          onOpenChange={(open) => setOpenSheet(open ? "duplicates" : null)}
        >
          <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup side="right" className="w-[min(28rem,90vw)] sm:max-w-none">
            <div>
              <Sheet.Title>Duplicate emails</Sheet.Title>
            </div>
            <div className="mt-6 overflow-y-auto pr-2">
              <DuplicateEmailsPanel
                resolution={duplicateEmailResolution}
                strategy={duplicateEmailStrategy}
                onStrategyChange={onDuplicateEmailStrategyChange}
              />
            </div>
          </Sheet.Popup>
      </Sheet.Portal>
        </Sheet.Root>
      ) : null}

      {showIssues ? (
        <Sheet.Root
          open={openSheet === "issues"}
          onOpenChange={(open) => setOpenSheet(open ? "issues" : null)}
        >
          <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup side="right" className="w-[min(24rem,90vw)] sm:max-w-none">
            <div>
              <Sheet.Title>Issues</Sheet.Title>
            </div>
            <div className="mt-6 flex flex-col gap-3 overflow-y-auto pr-2">
              <UserMatchesPanel
                pendingExactCount={pendingExactMatchCount}
                pendingFuzzyCount={pendingFuzzyMatchCount}
                onConfirmAllExact={onConfirmAllExactMatches}
              />
              <ValidationErrorsPanel
                errors={validationErrors}
                fields={fields}
                initialCount={sessionErrorCount}
                collapsed={validationPanelCollapsed}
                focusTarget={focusTarget}
                onToggleCollapsed={onValidationPanelToggle}
                onFocusError={onFocusError}
              />
              <NeedsAttentionPanel
                groups={unresolvedGroups}
                conflicts={conflicts}
                progress={courseProgress}
                collapsed={panelCollapsed}
                onToggleCollapsed={onPanelToggle}
                onResolve={onResolve}
              />
            </div>
          </Sheet.Popup>
      </Sheet.Portal>
        </Sheet.Root>
      ) : null}
    </>
  );
}
