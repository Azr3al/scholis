"use client";
import { Button, Select, Tabs, Textarea, buttonVariants, useToast } from "@/components/primitives";
import { TextShimmer } from "@/components/misc/text-shimmer";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";

import { parseImport, type ParseResult } from "@/app/client-api/imports";
import useImportStore from "@/store/import-store";
import { findRememberedImport } from "@/lib/imports/remembered-imports";
import { parseExcelPasteWithHeaders } from "@/lib/imports/parse-excel-paste";

function applyParseResultToStore(result: ParseResult) {
  const {
    setParse,
    setStep,
    setRole,
    setMapping,
    setFieldDefaults,
    setRememberedImportApplied,
  } = useImportStore.getState();

  setParse(result);
  const remembered = findRememberedImport(result.headers);
  if (remembered) {
    setRole(remembered.role);
    setMapping(remembered.mapping);
    setFieldDefaults(remembered.fieldDefaults);
    if (remembered.matchConfig) {
      useImportStore.getState().setMatchPriority(
        remembered.matchPriority ?? [
          "email",
          "communication_email",
          "phone_number",
        ],
      );
      for (const [k, v] of Object.entries(remembered.matchConfig)) {
        useImportStore.getState().setMatchColumn(k, v);
      }
    }
    setRememberedImportApplied(true);
  } else {
    setMapping({});
    setFieldDefaults({});
    setRememberedImportApplied(false);
  }
  setStep("map");
}

export function UploadStep() {
  const setLastFile = useImportStore((s) => s.setLastFile);
  const toast = useToast();
  const [pasteText, setPasteText] = useState("");

  const parsedPaste = useMemo(
    () => parseExcelPasteWithHeaders(pasteText),
    [pasteText],
  );

  const canContinuePaste =
    parsedPaste.headers.length > 0 &&
    parsedPaste.rows.length > 0 &&
    parsedPaste.error === null;

  const mutation = useMutation({
    mutationFn: (file: File) => parseImport(file),
    onSuccess: (result, file) => {
      setLastFile(file);
      applyParseResultToStore(result);
    },
    onError: () => {
      toast.add({
        title: "Could not read file",
        description: "Upload a valid .xlsx or .csv file.",
        type: "error",
      });
    },
  });

  const onDrop = useCallback(
    (files: File[]) => {
      if (files[0]) mutation.mutate(files[0]);
    },
    [mutation],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
    },
  });

  function handlePasteContinue() {
    if (!canContinuePaste) return;

    const parseResult: ParseResult = {
      sheetNames: ["Pasted"],
      activeSheet: "Pasted",
      headers: parsedPaste.headers,
      rows: parsedPaste.rows,
      rowCount: parsedPaste.rows.length,
    };

    applyParseResultToStore(parseResult);
  }

  return (
    <div className="space-y-4">
      <div className="w-64">
        <Select defaultValue="users" items={[{ value: "users", label: "Users" }, { value: "courses", label: "Courses (coming soon)" }]} />
      </div>

      <Tabs.Root defaultValue="upload">
        <Tabs.List>
          <Tabs.Tab value="upload">Upload file</Tabs.Tab>
          <Tabs.Tab value="paste">Paste from Excel</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="upload" className="mt-4">
          <div
            {...getRootProps()}
            className="rounded-lg border border-dashed bg-muted/20 p-10 text-center"
          >
            <input {...getInputProps()} />
            {mutation.isLoading ? (
              <TextShimmer>Parsing file…</TextShimmer>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isDragActive
                  ? "Drop the file…"
                  : "Drag an Excel or CSV file here"}
              </p>
            )}
            <Button
              className="mt-3"
              type="button"
              onClick={open}
              disabled={mutation.isLoading}
            >
              {mutation.isLoading ? "Parsing…" : "Choose file"}
            </Button>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="paste" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Copy rows from Excel and paste below. The first row should be column
            headers.
          </p>

          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste tab-separated values from Excel…"
            className="min-h-[160px] font-mono text-xs"
            aria-label="Paste Excel rows"
          />

          {parsedPaste.rows.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Preview — {parsedPaste.rows.length} row
                {parsedPaste.rows.length === 1 ? "" : "s"} ready
              </p>
              <div className="max-h-[240px] overflow-auto rounded-md border">
                <table>
                  <thead>
                    <tr>
                      <th className="w-10 shrink-0 text-xs">#</th>
                      {parsedPaste.headers.map((header, colIndex) => (
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
                    {parsedPaste.rows.map((row, rowIndex) => (
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
          ) : parsedPaste.headers.length > 0 &&
            parsedPaste.error === "No data rows found" ? (
            <p className="text-sm text-muted-foreground">
              Add at least one data row below the header.
            </p>
          ) : pasteText.trim().length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Paste tab-separated values copied from Excel.
            </p>
          ) : null}

          {parsedPaste.warnings.map((warning) => (
            <p key={warning} className="text-sm text-amber-600">
              {warning}
            </p>
          ))}

          {parsedPaste.error &&
          parsedPaste.error !== "No data rows found" ? (
            <p className="text-sm text-destructive">{parsedPaste.error}</p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!canContinuePaste}
              onClick={handlePasteContinue}
            >
              Continue
            </Button>
          </div>
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  );
}
