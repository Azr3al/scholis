"use client";
import { Button, Checkbox, buttonVariants } from "@/components/primitives";

import { addSubjectsToProgram } from "@/app/client-api/utils";
import {
  parseSubjectColumn,
  type ParsedSubjectRow,
} from "@/lib/subjects/parse-subject-column";
import {
  computeRowStatus,
  summarizeStatuses,
  type ExistingSubject,
  type SubjectRowStatus,
} from "@/lib/subjects/subject-row-status";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Trash as Trash2 } from "iconoir-react";
import { useMemo, useState } from "react";

type PreviewRow = ParsedSubjectRow & {
  index: number;
  status: SubjectRowStatus;
};

const STATUS_LABEL: Record<SubjectRowStatus, string> = {
  new: "new",
  link: "will link",
  skip: "already linked",
};

export function BulkAddSubjects({
  programId,
  orgSubjects,
  linkedSubjectIds,
  onCommitted,
  enabled = true,
}: {
  programId: string;
  orgSubjects: ExistingSubject[];
  linkedSubjectIds: Set<number>;
  onCommitted: () => void;
  enabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [stripSections, setStripSections] = useState(true);
  const [splitCommas, setSplitCommas] = useState(true);
  const [titleCase, setTitleCase] = useState(false);
  const [edited, setEdited] = useState<Record<number, string>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(
    () => parseSubjectColumn(text, { stripSections, splitCommas, titleCase }),
    [text, stripSections, splitCommas, titleCase],
  );

  const rows: PreviewRow[] = useMemo(() => {
    const result: PreviewRow[] = [];
    parsed.forEach((row, index) => {
      if (removed.has(index)) return;
      const name = (edited[index] ?? row.name).trim();
      if (!name) return;
      result.push({
        ...row,
        name,
        index,
        status: computeRowStatus(name, orgSubjects, linkedSubjectIds),
      });
    });
    return result;
  }, [parsed, edited, removed, orgSubjects, linkedSubjectIds]);

  const summary = useMemo(
    () => summarizeStatuses(rows.map((r) => r.status)),
    [rows],
  );

  const tooLong = rows.find((r) => r.name.length > 512);
  const largePaste = parsed.length > 500;

  const mutation = useMutation({
    mutationFn: () =>
      addSubjectsToProgram(
        programId,
        rows.filter((r) => r.status !== "skip").map((r) => r.name),
      ),
    onSuccess: () => {
      setText("");
      setEdited({});
      setRemoved(new Set());
      setOpen(false);
      setError(null);
      onCommitted();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to add."),
  });

  if (!enabled) return null;

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Paste a column
      </Button>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="paste-subjects" className="text-sm font-medium">
            Paste the column from Excel
          </label>
          <textarea
            id="paste-subjects"
            className="min-h-[160px] w-full rounded-md border bg-transparent p-2 font-mono text-xs leading-relaxed"
            placeholder={
              "Dip IFR Section (A)\nDip IFR Section (B)\nAudit & Assurance"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground max-w-[65ch]">
            Sections like A/B become separate classes later — not separate
            subjects.
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="paste-strip-sections"
              checked={stripSections}
              onCheckedChange={(v) => setStripSections(v === true)}
            />
            <label htmlFor="paste-strip-sections" className="text-sm font-normal">
              Strip section suffixes (&quot;Section (A)&quot;, &quot;- B&quot;)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="paste-split-commas"
              checked={splitCommas}
              onCheckedChange={(v) => setSplitCommas(v === true)}
            />
            <label htmlFor="paste-split-commas" className="text-sm font-normal">
              Split comma-separated values (&quot;BT, MA&quot; → two subjects)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="paste-title-case"
              checked={titleCase}
              onCheckedChange={(v) => setTitleCase(v === true)}
            />
            <label htmlFor="paste-title-case" className="text-sm font-normal">
              Title Case cleanup
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Preview — {rows.length} subjects</p>
          <ul className="space-y-1.5 max-h-[260px] overflow-auto">
            {rows.map((row, i) => (
              <li
                key={row.index}
                className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                style={{
                  animation: "fadeIn 150ms ease-out both",
                  animationDelay: `${Math.min(i, 12) * 30}ms`,
                }}
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    row.status === "new" && "bg-emerald-500/15 text-emerald-600",
                    row.status === "link" && "bg-sky-500/15 text-sky-600",
                    row.status === "skip" && "bg-muted text-muted-foreground",
                  )}
                >
                  {STATUS_LABEL[row.status]}
                </span>
                <input
                  className="flex-1 bg-transparent font-mono text-xs outline-none"
                  value={row.name}
                  disabled={row.status === "skip"}
                  onChange={(e) =>
                    setEdited((prev) => ({
                      ...prev,
                      [row.index]: e.target.value,
                    }))
                  }
                />
                {row.mergedCount > 1 && (
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                    x{row.mergedCount} merged
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm" className="h-7 w-7 shrink-0"
                  onClick={() =>
                    setRemoved((prev) => new Set(prev).add(row.index))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Paste a column to preview subjects.
              </li>
            )}
          </ul>
        </div>
      </div>

      {largePaste && (
        <p className="text-sm text-amber-600">
          Large paste ({parsed.length} rows). Review the preview before adding.
        </p>
      )}
      {tooLong && (
        <p className="text-sm text-destructive">
          One or more names exceed 512 characters. Shorten them before adding.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-xs text-muted-foreground">
          {summary.new} new · {summary.link} will link · {summary.skip} skipped
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="active:scale-[0.98]"
            disabled={
              summary.actionable === 0 || !!tooLong || mutation.isLoading
            }
            isLoading={mutation.isLoading}
            onClick={() => mutation.mutate()}
          >
            Add {summary.actionable} subjects
          </Button>
        </div>
      </div>
    </div>
  );
}
