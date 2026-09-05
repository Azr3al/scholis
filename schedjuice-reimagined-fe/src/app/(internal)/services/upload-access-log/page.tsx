"use client";

import { PageContainer } from "@/components/layout/page-container";
import { useEffect, useState } from "react";
import { TypographyH1 } from "@/components/typography/h1";
import { Button, useToast } from "@/components/primitives";
import FileDragAndDrop, {
  extendedFileType,
  localFileType,
} from "@/components/form/file-drag-and-drop";
import { useMutation } from "@tanstack/react-query";
import { makePostRequest } from "@/app/client-api/utils";
import CsvToTable from "@/components/datatable/csv-to-table";
import { accessLogCsvExample } from "@/csv-examples/access-log";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const UploadAccessLogPage: React.FC = () => {
  const [files, setFiles] = useState<extendedFileType[]>([]);
  const [selected, setSelected] = useState<File | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (files.length > 0) {
      const f = files[0] as localFileType;
      setSelected(f.file);
    } else {
      setSelected(null);
    }
  }, [files]);

  const mutation = useMutation({
    mutationKey: ["parse-access-log-dahua"],
    mutationFn: (f: File) => {
      const formData = new FormData();
      formData.append("file", f);
      return makePostRequest(
        "parse-access-log/dahua",
        formData,
        { size: -1 },
        { "Content-Type": "multipart/form-data" },
      );
    },
    onSuccess: () => {
      toast.add({ description: "Access log parsed successfully" });
    },
    onError: (err: any) => {
      toast.add({
        description: err?.response?.data?.message || "Upload failed",
      });
    },
  });

  const summary = (mutation.data?.data?.data || null) as any;
  const isUploading = mutation.isPending;

  return (
    <PageContainer width="default" className="flex flex-col gap-4">
      <TypographyH1>Upload Access Log (Dahua)</TypographyH1>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-text-primary">Upload CSV</h2>
          <p className="text-sm text-text-secondary">
            Upload Dahua access log exported as CSV. Only &quot;Check In&quot;
            (earliest) and &quot;Check Out&quot; (latest) per day are recorded.
            See CSV example below.
          </p>
        </div>

        <CsvToTable {...accessLogCsvExample} />

        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-md border border-border bg-surface-hover p-3">
            <div className="mb-2 text-sm font-medium text-text-primary">
              CSV Format Requirements
            </div>
            <ul className="flex flex-col gap-1 text-xs text-text-secondary">
              <li>
                • <strong>Required headers:</strong> employee-no, date,
                record-type
              </li>
              <li>
                • <strong>employee-no</strong> must exactly match User&apos;s
                access_log_name (case-sensitive)
              </li>
              <li>
                • <strong>record-type:</strong> Only &quot;Check In&quot; and
                &quot;Check Out&quot; are processed (case-insensitive)
              </li>
              <li>
                • Break entries (Break In/Out) are ignored but counted in summary
              </li>
              <li>
                • <strong>Date formats:</strong> MM/DD/YYYY HH:MM, MM/DD/YYYY
                HH:MM:SS, DD/MM/YYYY HH:MM, DD/MM/YYYY HH:MM:SS, YYYY/MM/DD
                HH:MM:SS, YYYY-MM-DD HH:MM:SS
              </li>
              <li>
                • Multiple check-ins/outs per day: earliest check-in and latest
                check-out are kept
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <FileDragAndDrop
            files={files}
            setFiles={setFiles}
            maxFiles={1}
            label={"Upload a CSV file (.csv or .txt)"}
          />

          {selected && (
            <div className="flex items-center justify-between rounded-md border border-border p-3 text-xs">
              <div className="flex flex-col">
                <span className="font-medium text-text-primary">
                  {selected.name}
                </span>
                <span className="text-text-muted">
                  {formatBytes(selected.size)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setFiles([])}
                  disabled={isUploading}
                >
                  Remove
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              isLoading={isUploading}
              disabled={!selected}
              onClick={() => selected && mutation.mutate(selected)}
            >
              Upload & Parse
            </Button>
          </div>

          <div className="text-xs text-text-muted">
            Header expectation: Employee No., Date, Record Type. Unknown
            employees (no matching access_log_name) will be reported.
          </div>
        </div>

        {mutation.isSuccess && (
          <div className="rounded-lg border border-border bg-surface-hover p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-accent" />
              <div className="font-medium text-text-primary">
                Upload Completed Successfully
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-md border border-border bg-surface p-3">
                  <div className="text-2xl font-bold text-text-primary">
                    {summary?.created}
                  </div>
                  <div className="text-sm text-text-secondary">
                    New attendance records
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface p-3">
                  <div className="text-2xl font-bold text-text-primary">
                    {summary?.updated}
                  </div>
                  <div className="text-sm text-text-secondary">
                    Updated records
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface p-3">
                  <div className="text-2xl font-bold text-text-primary">
                    {summary?.skipped}
                  </div>
                  <div className="text-sm text-text-secondary">
                    Already processed
                  </div>
                </div>
              </div>

              {summary?.ignored_non_check_rows > 0 && (
                <div className="rounded-md border border-border bg-surface p-3">
                  <div className="text-sm text-text-secondary">
                    <strong>{summary.ignored_non_check_rows}</strong> break in
                    entries were ignored (only check-in/out times are recorded)
                  </div>
                </div>
              )}

              {summary?.unknown_users?.length > 0 && (
                <div className="rounded-md border border-border bg-surface p-3">
                  <div className="mb-2 font-medium text-text-primary">
                    Employees Not Found
                  </div>
                  <div className="mb-2 text-sm text-text-secondary">
                    The following employee IDs were not found in the system:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {summary.unknown_users.map((u: string) => (
                      <span
                        key={u}
                        className="rounded bg-surface-hover px-2 py-1 text-xs font-medium"
                      >
                        {u}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-text-muted">
                    Please verify these employee numbers.
                  </div>
                </div>
              )}

              {summary?.parse_errors?.length > 0 && (
                <div className="rounded-md border border-danger/40 bg-danger/5 p-3">
                  <div className="mb-2 font-medium text-danger">
                    Data Format Issues
                  </div>
                  <ul className="flex flex-col gap-1">
                    {summary.parse_errors.map((e: any, idx: number) => (
                      <li key={idx} className="text-sm text-danger">
                        Line {e.row}: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-border pt-2 text-center text-xs text-text-muted">
                {summary?.created + summary?.updated + summary?.skipped}{" "}
                successful attendance records processed
              </div>
            </div>
          </div>
        )}
      </section>
    </PageContainer>
  );
};

export default UploadAccessLogPage;
