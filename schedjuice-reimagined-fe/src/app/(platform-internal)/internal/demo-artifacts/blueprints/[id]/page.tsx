"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchDemoArtifactBlueprint } from "@/lib/demo-artifacts-api";
import type { ArtifactDetail } from "@/types/demo-artifacts";

import {
  ArtifactDetailHeader,
  DemoArtifactsPageShell,
  KeyValueTable,
  LinkedItemList,
} from "../../_components/demo-artifacts-shell";
import { SourcePanel } from "../../_components/source-panel";

export default function BlueprintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDemoArtifactBlueprint(id)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) {
    return (
      <DemoArtifactsPageShell
        title="Blueprint"
        breadcrumbs={[
          { href: "/internal/demo-artifacts/blueprints", label: "Blueprints" },
          { label: id },
        ]}
      >
        <p className="text-destructive text-xs">{error}</p>
      </DemoArtifactsPageShell>
    );
  }

  if (!detail) {
    return (
      <DemoArtifactsPageShell title="Blueprint">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </DemoArtifactsPageShell>
    );
  }

  const summary = detail.summary as {
    use_case_order?: string[];
    default_scenario_packs?: string[];
    terminology?: Record<string, string>;
  };

  return (
    <DemoArtifactsPageShell
      title="Blueprint"
      breadcrumbs={[
        { href: "/internal/demo-artifacts/blueprints", label: "Blueprints" },
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
            key: "Use case order",
            value: (
              <LinkedItemList
                items={summary.use_case_order ?? []}
                hrefFor={(useCaseId) =>
                  `/internal/demo-artifacts/use-cases/${encodeURIComponent(useCaseId)}`
                }
              />
            ),
          },
          {
            key: "Default packs",
            value: (
              <LinkedItemList
                items={summary.default_scenario_packs ?? []}
                hrefFor={(packId) =>
                  `/internal/demo-artifacts/scenario-packs/${encodeURIComponent(packId)}`
                }
              />
            ),
          },
          {
            key: "Terminology",
            value: summary.terminology
              ? Object.entries(summary.terminology)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(", ")
              : "—",
          },
        ]}
      />
      <SourcePanel source={detail.source} />
    </DemoArtifactsPageShell>
  );
}
