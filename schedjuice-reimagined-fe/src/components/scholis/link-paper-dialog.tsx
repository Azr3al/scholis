"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Button, Dialog, Field, Input, Select, useToast } from "@/components/primitives";
import {
  getResultSheetGrid,
  listResultSheets,
} from "@/lib/grading-reports-api";
import { linkScholisPaper, scholisErrorMessage } from "@/lib/scholis-api";
import { extractTestId } from "@/lib/scholis/test-id";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  /**
   * Pre-filled when re-linking a paper that is already bound, so "Move" opens on
   * the paper being moved rather than on a blank form asking for an id the teacher
   * has already supplied once.
   */
  initialTestId?: string;
  /**
   * Needed alongside the column, not instead of it: the column list only loads
   * once a sheet is chosen, and `Select` drops a controlled value that is not
   * among its items. Prefilling the column without its sheet would submit the
   * right value while showing an empty box, which is worse than showing nothing.
   */
  initialSheetId?: number;
  initialColumnId?: number;
};

export function ScholisLinkPaperDialog({
  open,
  onOpenChange,
  courseId,
  initialTestId,
  initialSheetId,
  initialColumnId,
}: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [rawId, setRawId] = useState(initialTestId ?? "");
  const [sheetId, setSheetId] = useState<string>(
    initialSheetId ? String(initialSheetId) : "",
  );
  const [columnId, setColumnId] = useState<string>(
    initialColumnId ? String(initialColumnId) : "",
  );
  const [title, setTitle] = useState("");

  const sheets = useQuery({
    queryKey: ["result-sheets", courseId],
    queryFn: () => listResultSheets(courseId),
    enabled: open,
  });

  // Columns belong to a sheet, so they are only fetched once one is chosen.
  const grid = useQuery({
    queryKey: ["result-sheet-grid", sheetId],
    queryFn: () => getResultSheetGrid(Number(sheetId)),
    enabled: open && sheetId !== "",
  });

  const testId = useMemo(() => extractTestId(rawId), [rawId]);

  const sheetItems = useMemo(
    () =>
      (sheets.data ?? []).map((sheet) => ({
        value: String(sheet.id),
        label: `${format(new Date(sheet.exam_date), "MMMM yyyy")} sheet`,
      })),
    [sheets.data],
  );

  const columnItems = useMemo(
    () =>
      (grid.data?.columns ?? []).map((column) => ({
        value: String(column.id),
        label:
          column.max_marks === null
            ? column.title
            : `${column.title} (max ${column.max_marks})`,
      })),
    [grid.data],
  );

  const link = useMutation({
    mutationKey: ["scholis", "link-paper"],
    mutationFn: () =>
      linkScholisPaper({
        scholis_test_id: testId,
        // Omitted entirely rather than sent as null when nothing is chosen: the
        // backend rejects a column_id that does not exist, and an empty string is
        // a value that does not exist.
        ...(columnId ? { column_id: Number(columnId) } : {}),
        course_id: courseId,
        ...(title.trim() ? { title: title.trim() } : {}),
      }),
    onSuccess: (paper) => {
      void queryClient.invalidateQueries({ queryKey: ["scholis", "papers", courseId] });
      toast.add({
        title: paper.column ? "Paper linked" : "Paper saved, not placed yet",
        description: paper.column
          ? `Released marks will land in “${paper.column.title}”.`
          : "Marks will be stored here and wait until a column is chosen.",
      });
      onOpenChange(false);
      setRawId("");
      setColumnId("");
      setTitle("");
    },
    onError: (error) => {
      toast.add({
        title: "Could not link that paper",
        description: scholisErrorMessage(error, "Scholis did not accept the request."),
      });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!testId) return;
    link.mutate();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Link a Scholis paper</Dialog.Title>
          <Dialog.Description>
            Bind a paper to a gradebook column. Re-linking moves it rather than
            creating a second binding, so marks are never written twice.
          </Dialog.Description>

          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field.Root>
              <Field.Label>Scholis paper</Field.Label>
              <Input
                value={rawId}
                onChange={(e) => setRawId(e.target.value)}
                placeholder="Paste the paper's link or its id"
                required
              />
              <Field.Description>
                {rawId.trim() && !testId
                  ? "That does not look like a Scholis paper id. Paste the link to the paper and it will be picked out."
                  : "Scholis does not expose a list of papers, so the id or the paper's own URL has to come from you."}
              </Field.Description>
            </Field.Root>

            <Field.Root>
              <Field.Label>Result sheet</Field.Label>
              <Select
                items={sheetItems}
                value={sheetId}
                onValueChange={(value) => {
                  setSheetId(value);
                  // A column from the previous sheet is meaningless in this one.
                  setColumnId("");
                }}
                placeholder={
                  sheets.isLoading ? "Loading sheets…" : "Choose the sheet that holds this paper"
                }
                size="full"
              />
            </Field.Root>

            <Field.Root>
              <Field.Label>Column</Field.Label>
              <Select
                items={columnItems}
                value={columnId}
                onValueChange={setColumnId}
                placeholder={
                  !sheetId
                    ? "Choose a sheet first"
                    : grid.isLoading
                      ? "Loading columns…"
                      : columnItems.length === 0
                        ? "That sheet has no columns yet"
                        : "Where the marks should land"
                }
                size="full"
              />
              <Field.Description>
                Optional. Without a column the marks are still stored here and show
                as waiting to be placed.
              </Field.Description>
            </Field.Root>

            <Field.Root>
              <Field.Label>Label shown here</Field.Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Leave blank to use the paper's own title"
              />
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
                isLoading={link.isLoading}
                disabled={!testId}
              >
                Link paper
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
