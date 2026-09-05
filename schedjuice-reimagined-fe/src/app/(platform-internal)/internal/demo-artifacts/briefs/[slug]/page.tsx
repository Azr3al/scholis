"use client";

import { Spinner } from "@/components/primitives/spinner";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchDemoArtifactBrief } from "@/lib/demo-artifacts-api";
import type { BriefDetail, DemoStop } from "@/types/demo-artifacts";

import {
  ArtifactDetailHeader,
  DemoArtifactsPageShell,
  KeyValueTable,
  LinkedItemList,
} from "../../_components/demo-artifacts-shell";
import { DemoStopsPanel } from "../../_components/demo-stops-panel";
import { DemoProvisionPanel } from "../../_components/demo-provision-panel";
import { SourcePanel } from "../../_components/source-panel";

function provisionCommand(detail: BriefDetail) {
  return `python manage.py provision-demo \\
  --blueprint ${detail.summary.niche} \\
  --brief demo-artifacts/${detail.relative_path}`;
}

export default function BriefDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [detail, setDetail] = useState<BriefDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDemoArtifactBrief(slug)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  if (error) {
    return (
      <DemoArtifactsPageShell
        title="Brief"
        breadcrumbs={[
          { href: "/internal/demo-artifacts/briefs", label: "Briefs" },
          { label: slug },
        ]}
      >
        <p className="text-destructive text-xs">{error}</p>
      </DemoArtifactsPageShell>
    );
  }

  if (!detail) {
    return (
      <DemoArtifactsPageShell title="Brief">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </DemoArtifactsPageShell>
    );
  }

  const scriptStops: DemoStop[] =
    detail.generated_script?.available && detail.generated_script.json?.stops
      ? detail.generated_script.json.stops
      : detail.resolved?.demo_stops ?? [];

  return (
    <DemoArtifactsPageShell
      title={detail.summary.school_name}
      breadcrumbs={[
        { href: "/internal/demo-artifacts/briefs", label: "Briefs" },
        { label: detail.id },
      ]}
    >
      <ArtifactDetailHeader
        id={detail.id}
        valid={detail.valid}
        relativePath={detail.relative_path}
      />

      <section className="mb-6">
        <h3 className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">
          Summary
        </h3>
        <KeyValueTable
          rows={[
            {
              key: "Blueprint",
              value: (
                <Link
                  href={`/internal/demo-artifacts/blueprints/${encodeURIComponent(detail.summary.niche)}`}
                  className="underline"
                >
                  {detail.summary.niche}
                </Link>
              ),
            },
            { key: "Demo date", value: detail.summary.demo_date },
            { key: "Timezone", value: detail.summary.timezone ?? "—" },
            {
              key: "Pain points",
              value: (
                <LinkedItemList
                  items={detail.summary.pain_points}
                  hrefFor={(painPoint) =>
                    `/internal/demo-artifacts/use-cases/${encodeURIComponent(painPoint)}`
                  }
                />
              ),
            },
            {
              key: "Import",
              value: detail.summary.import ? (
                <Link
                  href={`/internal/demo-artifacts/imports/${encodeURIComponent(
                    detail.summary.import.file.split("/").pop() ?? ""
                  )}`}
                  className="underline"
                >
                  {detail.summary.import.file} ({detail.summary.import.mode})
                </Link>
              ) : (
                "—"
              ),
            },
          ]}
        />
      </section>

      {detail.resolved ? (
        <section className="mb-6">
          <h3 className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">
            Resolved config
          </h3>
          <KeyValueTable
            rows={[
              { key: "Domain", value: detail.resolved.domain_url },
              { key: "Schema", value: detail.resolved.schema_name },
              {
                key: "Scenario packs",
                value: (
                  <LinkedItemList
                    items={detail.resolved.scenario_pack_ids}
                    hrefFor={(packId) =>
                      `/internal/demo-artifacts/scenario-packs/${encodeURIComponent(packId)}`
                    }
                  />
                ),
              },
              {
                key: "Demo stops",
                value: `${detail.resolved.demo_stops.length} stops`,
              },
            ]}
          />
        </section>
      ) : null}

      <DemoProvisionPanel
        slug={detail.id}
        blueprintId={detail.summary.niche}
        briefRelativePath={detail.relative_path}
        onProvisionComplete={() => {
          fetchDemoArtifactBrief(slug).then(setDetail);
        }}
      />

      <section className="mb-6">
        <h3 className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">
          {detail.generated_script?.available
            ? "Generated script"
            : "Demo stops (resolved)"}
        </h3>
        {detail.generated_script?.available ? (
          <>
            {detail.generated_script.partial ? (
              <p className="text-amber-600 text-xs mb-2">
                Partial script on server — only one of JSON/Markdown is present.
              </p>
            ) : null}
            <DemoStopsPanel stops={scriptStops} />
            <SourcePanel
              label="View markdown source"
              source={
                detail.generated_script.markdown
                  ? { format: "markdown", content: detail.generated_script.markdown }
                  : null
              }
            />
          </>
        ) : (
          <>
            {!detail.generated_script?.available ? (
              <p className="text-muted-foreground text-xs mb-3">
                No generated script on this server yet. Use Demo provisioning above
                or run provision-demo locally:
              </p>
            ) : null}
            {!detail.generated_script?.available ? (
              <pre className="border border-border p-3 text-[11px] overflow-x-auto mb-4">
                {provisionCommand(detail)}
              </pre>
            ) : null}
            <DemoStopsPanel stops={scriptStops} />
          </>
        )}
      </section>

      <SourcePanel source={detail.source} />
    </DemoArtifactsPageShell>
  );
}
