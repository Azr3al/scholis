"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchDemoArtifactScenarioPack } from "@/lib/demo-artifacts-api";
import type { ArtifactDetail } from "@/types/demo-artifacts";

import {
  ArtifactDetailHeader,
  DemoArtifactsPageShell,
  KeyValueTable,
} from "../../_components/demo-artifacts-shell";
import { SourcePanel } from "../../_components/source-panel";

export default function ScenarioPackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDemoArtifactScenarioPack(id)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error || !detail) {
    return (
      <DemoArtifactsPageShell
        title="Scenario pack"
        breadcrumbs={[
          {
            href: "/internal/demo-artifacts/scenario-packs",
            label: "Scenario packs",
          },
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

  const summary = detail.summary as { label?: string; description?: string };

  return (
    <DemoArtifactsPageShell
      title="Scenario pack"
      breadcrumbs={[
        {
          href: "/internal/demo-artifacts/scenario-packs",
          label: "Scenario packs",
        },
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
          { key: "Description", value: summary.description ?? "—" },
        ]}
      />
      <SourcePanel source={detail.source} />
    </DemoArtifactsPageShell>
  );
}
