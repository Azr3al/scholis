"use client";
import { Button, Textarea, Tooltip, TooltipProvider, buttonVariants } from "@/components/primitives";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/misc/collapsible";

import { NavArrowDown as ChevronDown, Plus } from "iconoir-react";
import { useMemo, useState } from "react";

import { parseExcelPaste } from "@/lib/imports/parse-excel-paste";
import { cn } from "@/lib/utils";

const COLUMN_HINT_MAX = 120;

type PasteImportRowPanelProps = {
  headers: string[];
  disabled?: boolean;
  onRowsAdded: (rows: (string | null)[][]) => Promise<void>;
  className?: string;
};

export function PasteImportRowPanel({
  headers,
  disabled = false,
  onRowsAdded,
  className,
}: PasteImportRowPanelProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columnCount = headers.length;
  const columnHint = headers
    .map((header) => header || "(blank)")
    .join(" | ");
  const truncatedHint =
    columnHint.length > COLUMN_HINT_MAX
      ? `${columnHint.slice(0, COLUMN_HINT_MAX)}…`
      : columnHint;

  const parsed = useMemo(
    () => parseExcelPaste(text, columnCount),
    [text, columnCount],
  );

  const canAdd = parsed.rows.length > 0 && !disabled && !submitting;

  async function handleAdd() {
    if (!canAdd) return;
    setSubmitting(true);
    setError(null);
    try {
      await onRowsAdded(parsed.rows);
      setText("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add rows");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("rounded-lg border", className)}
    >
      <CollapsibleTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
        }
      >
        <span className="flex items-center gap-2">
          <Plus className="size-4 shrink-0" aria-hidden />
          Paste rows from Excel
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Paste one or more Excel rows. Column order matches your uploaded
            file.
          </p>

          {columnCount > 0 ? (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Column order: </span>
              {columnHint.length > COLUMN_HINT_MAX ? (
                <Tooltip.Root>
                  <Tooltip.Trigger render={<span className="cursor-help underline decoration-dotted underline-offset-2">
                      {truncatedHint}
                    </span>} />
                  <Tooltip.Portal>
        <Tooltip.Positioner>
        <Tooltip.Popup className="max-w-md">
                    <p className="text-xs">{columnHint}</p>
                  </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
                </Tooltip.Root>
              ) : (
                <span>{truncatedHint}</span>
              )}
            </div>
          ) : null}

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled || submitting}
            placeholder="Copy a row from Excel and paste here (tab-separated)"
            className="min-h-[100px] font-mono text-xs"
            aria-label="Paste Excel rows"
          />

          {parsed.rows.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Preview — {parsed.rows.length} row
                {parsed.rows.length === 1 ? "" : "s"} ready to add
              </p>
              <div className="max-h-[240px] overflow-auto rounded-md border">
                <table>
                  <thead>
                    <tr>
                      <th className="w-10 shrink-0 text-xs">#</th>
                      {headers.map((header, colIndex) => (
                        <th
                          key={`${header}-${colIndex}`}
                          className="min-w-[100px] text-xs whitespace-nowrap"
                        >
                          {header || "(blank)"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        <td className="text-xs text-muted-foreground">
                          {rowIndex + 1}
                        </td>
                        {row.map((cell, colIndex) => (
                          <td
                            key={colIndex}
                            className="max-w-[200px] truncate font-mono text-xs"
                            title={cell ?? undefined}
                          >
                            {cell ?? (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : text.trim().length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Paste tab-separated values copied from Excel.
            </p>
          ) : null}

          {parsed.warnings.map((warning) => (
            <p key={warning} className="text-sm text-amber-600">
              {warning}
            </p>
          ))}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={!canAdd}
              isLoading={submitting}
              onClick={() => void handleAdd()}
            >
              Add {parsed.rows.length > 0 ? parsed.rows.length : ""} row
              {parsed.rows.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
