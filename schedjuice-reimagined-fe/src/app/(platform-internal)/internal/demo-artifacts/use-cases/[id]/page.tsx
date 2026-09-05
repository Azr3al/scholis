"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchDemoArtifactUseCase } from "@/lib/demo-artifacts-api";
import type { ArtifactDetail, DemoStop } from "@/types/demo-artifacts";

import {
  ArtifactDetailHeader,
  DemoArtifactsPageShell,
  KeyValueTable,
  LinkedItemList,
} from "../../_components/demo-artifacts-shell";
import { DemoStopsPanel } from "../../_components/demo-stops-panel";
import { SourcePanel } from "../../_components/source-panel";

export default function UseCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDemoArtifactUseCase(id)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error || !detail) {
    return (
      <DemoArtifactsPageShell
        title="Use case"
        breadcrumbs={[
          { href: "/internal/demo-artifacts/use-cases", label: "Use cases" },
          { label: id },
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
    label?: string;
    scenario_packs?: string[];
    demo_stops?: DemoStop[];
  };

  return (
    <DemoArtifactsPageShell
      title="Use case"
      breadcrumbs={[
        { href: "/internal/demo-artifacts/use-cases", label: "Use cases" },
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
          { key: "Label", value: summary.label ?? detail.id },
          {
            key: "Scenario packs",
            value: (
              <LinkedItemList
                items={summary.scenario_packs ?? []}
                hrefFor={(packId) =>
                  `/internal/demo-artifacts/scenario-packs/${encodeURIComponent(packId)}`
                }
              />
            ),
          },
        ]}
      />
      <section className="mt-4 mb-6">
        <h3 className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">
          Demo stops
        </h3>
        <DemoStopsPanel stops={summary.demo_stops ?? []} />
      </section>
      <SourcePanel source={detail.source} />
    </DemoArtifactsPageShell>
  );
}
