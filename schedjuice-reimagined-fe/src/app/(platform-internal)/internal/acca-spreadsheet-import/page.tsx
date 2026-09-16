"use client";

import { PageContainer } from "@/components/layout/page-container";
import FileDragAndDrop, {
  extendedFileType,
  localFileType,
} from "@/components/form/file-drag-and-drop";
import { RequireInternalTenant } from "@/components/internal/require-internal-tenant";
import { Button } from "@/components/primitives";
import { Checkbox } from "@/components/primitives";
import { Input } from "@/components/primitives";
import { Label } from "@/app/_chrome/label";
import { useToast } from "@/components/primitives";
import { useInternalTenantSchema } from "@/hooks/useInternalTenantSchema";
import { axiosClient } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { Terminal } from "iconoir-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ApiResponse = {
  isError: boolean;
  message: string;
  output?: string;
  stderr?: string;
  details?: string;
};

export default function AccaSpreadsheetImportDebugPage() {
  const toast = useToast();
  const { schemaName, isLoading: schemaLoading } = useInternalTenantSchema();
  const [schemaNameOverride, setSchemaNameOverride] = useState("");
  const [categoryName, setCategoryName] = useState("ACCA");
  const [dryRun, setDryRun] = useState(true);
  const [confirmWrite, setConfirmWrite] = useState(false);
  const [files, setFiles] = useState<extendedFileType[]>([]);
  const [lastResponse, setLastResponse] = useState<ApiResponse | null>(null);

  useEffect(() => {
    setSchemaNameOverride(schemaName ?? "");
  }, [schemaName]);

  const effectiveSchema = schemaNameOverride.trim() || schemaName?.trim() || "";

  const mutation = useMutation({
    mutationKey: ["acca-import-debug"],
    mutationFn: async () => {
      const f = files[0] as localFileType | undefined;
      if (!f?.file) {
        throw new Error("Choose a CSV file");
      }
      if (!effectiveSchema) {
        throw new Error("Schema name is required");
      }
      if (!dryRun && !confirmWrite) {
        throw new Error("Confirm database writes before running");
      }
      const fd = new FormData();
      fd.append("schema_name", effectiveSchema);
      const cat = categoryName.trim();
      if (cat) {
        fd.append("category_name", cat);
      }
      fd.append("dry_run", dryRun ? "true" : "false");
      if (!dryRun) {
        fd.append("confirm_write", "true");
      }
      fd.append("file", f.file);
      const { data } = await axiosClient.post<ApiResponse>(
        "management/import-acca-students",
        fd,
      );
      return data;
    },
    onSuccess: (data) => {
      setLastResponse(data);
      if (data.isError) {
        toast.add({
          title: data.message,
          description:
            data.details ?? data.stderr ?? "See output panel for detail.",
        });
      }
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiResponse | undefined;
        if (body && typeof body === "object") {
          setLastResponse(body);
        }
        toast.add({
          title: body?.message ?? "Request failed",
          description:
            body?.details ??
            body?.stderr ??
            err.message ??
            "Unknown error",
        });
        return;
      }
      if (err instanceof Error) {
        toast.add({
          title: "Cannot run",
          description: err.message,
        });
      }
    },
  });

  const pending = mutation.isPending;

  const canSubmit = useMemo(() => {
    if (!effectiveSchema) return false;
    if (!dryRun && !confirmWrite) return false;
    return true;
  }, [dryRun, confirmWrite, effectiveSchema]);

  return (
    <PageContainer width="wide" className="font-mono text-sm min-h-[70vh] max-w-3xl space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Terminal className="h-4 w-4" />
          <span>INTERNAL / ACCA SPREADSHEET IMPORT</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          POST /api/v1/management/import-acca-students
        </h1>
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          Multipart CSV upload for import_acca_students. Same email allowlist as
          management commands. Dry run defaults ON each visit.
        </p>
        <p className="mt-3 text-xs">
          <Link href="/internal" className="underline underline-offset-2">
            ← Internal overview
          </Link>
        </p>
      </div>

      <RequireInternalTenant>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="schema-name">Schema name</Label>
            <Input
              id="schema-name"
              value={schemaNameOverride}
              onChange={(e) => setSchemaNameOverride(e.target.value)}
              disabled={pending || schemaLoading}
              placeholder={
                schemaLoading ? "Resolving from tenant…" : "tenant schema_name"
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Prefills from the selected tenant domain (same formula as org create).
              Override only if the schema differs.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-name">Category name</Label>
            <Input
              id="category-name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              disabled={pending}
            />
          </div>

          <FileDragAndDrop
            files={files}
            setFiles={setFiles}
            maxFiles={1}
            isMultiple={false}
            label="Upload CSV"
            isReadOnly={pending}
            isButtonDisabled={pending}
          />

          <div className="flex items-center gap-2">
            <Checkbox
              id="dry-run"
              checked={dryRun}
              onCheckedChange={(v) => {
                const on = v === true;
                setDryRun(on);
                if (on) {
                  setConfirmWrite(false);
                }
              }}
              disabled={pending}
            />
            <Label htmlFor="dry-run">Dry run (no database writes)</Label>
          </div>

          {!dryRun ? (
            <div className="flex items-start gap-2 rounded border border-border p-3">
              <Checkbox
                id="confirm-write"
                checked={confirmWrite}
                onCheckedChange={(v) => setConfirmWrite(v === true)}
                disabled={pending}
              />
              <Label htmlFor="confirm-write" className="font-normal leading-snug">
                I understand this will write to the tenant database.
              </Label>
            </div>
          ) : null}

          <Button
            type="button"
            isLoading={pending}
            disabled={!canSubmit || pending || schemaLoading}
            onClick={() => mutation.mutate()}
          >
            Run import
          </Button>
        </div>

        {lastResponse ? (
          <pre className="bg-muted/40 border border-border p-4 text-xs overflow-auto max-h-[50vh] whitespace-pre-wrap rounded-md">
            {lastResponse.output ?? ""}
            {lastResponse.stderr
              ? `\n--- stderr ---\n${lastResponse.stderr}`
              : ""}
            {lastResponse.details
              ? `\n--- details ---\n${lastResponse.details}`
              : ""}
          </pre>
        ) : null}
      </RequireInternalTenant>
    </PageContainer>
  );
}
