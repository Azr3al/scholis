"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchDemoArtifactImport } from "@/lib/demo-artifacts-api";
import type { ArtifactDetail } from "@/types/demo-artifacts";

import {
  ArtifactDetailHeader,
  DemoArtifactsPageShell,
  KeyValueTable,
  LinkedItemList,
} from "../../_components/demo-artifacts-shell";
import { SourcePanel } from "../../_components/source-panel";

export default function ImportDetailPage() {
  const { filename } = useParams<{ filename: string }>();
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDemoArtifactImport(filename)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, [filename]);

  if (error || !detail) {
    return (
      <DemoArtifactsPageShell
        title="Import"
        breadcrumbs={[
          { href: "/internal/demo-artifacts/imports", label: "Imports" },
          { label: filename },
        ]}
      >
        {error ? (
          <p className="text-destructive text-xs">{error}</p>
        ) : (
          <Spinner className="h-6 w-6 text-muted-foreground" />
        )}
      </DemoArtifactsPageShell>
    );
  }

  const summary = detail.summary as {
    linked_briefs?: string[];
    has_mapping?: boolean;
    mapping_path?: string;
  };

  return (
    <DemoArtifactsPageShell
      title="Import"
      breadcrumbs={[
        { href: "/internal/demo-artifacts/imports", label: "Imports" },
        { label: detail.id },
      ]}
    >
      <ArtifactDetailHeader
        id={detail.id}
        valid={detail.valid}
        relativePath={detail.relative_path}
      />
      <KeyValueTable
        rows={[
          {
            key: "Linked briefs",
            value: (
              <LinkedItemList
                items={summary.linked_briefs ?? []}
                hrefFor={(slug) =>
                  `/internal/demo-artifacts/briefs/${encodeURIComponent(slug)}`
                }
              />
            ),
          },
          {
            key: "Mapping",
            value: summary.has_mapping
              ? summary.mapping_path ?? "Yes"
              : "—",
          },
        ]}
      />

      {detail.csv_preview ? (
        <section className="mt-4 mb-6">
          <h3 className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">
            CSV preview
            {detail.csv_preview.truncated
              ? ` (first ${detail.csv_preview.rows.length} of ${detail.csv_preview.total_rows} rows)`
              : ""}
          </h3>
          <div className="border border-border overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {detail.csv_preview.headers.map((header) => (
                    <th key={header} className="px-2 py-1 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.csv_preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-2 py-1 align-top">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <SourcePanel label="View CSV source" source={detail.source} />
      <SourcePanel
        label="View mapping source"
        source={detail.mapping_source}
      />
    </DemoArtifactsPageShell>
  );
}
