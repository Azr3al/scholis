"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useEffect, useState } from "react";

import { fetchDemoArtifactScenarioPacks } from "@/lib/demo-artifacts-api";
import type { ArtifactListItem } from "@/types/demo-artifacts";

import {
  ArtifactListTable,
  DemoArtifactsPageShell,
} from "../_components/demo-artifacts-shell";
import { ValidationBadge } from "../_components/validation-badge";

export default function ScenarioPackListPage() {
  const [items, setItems] = useState<ArtifactListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDemoArtifactScenarioPacks()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DemoArtifactsPageShell
      title="Scenario packs"
      breadcrumbs={[{ label: "Scenario packs" }]}
    >
      {loading ? (
        <Spinner className="h-6 w-6 text-muted-foreground" />
      ) : error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <ArtifactListTable
          items={items as unknown as Array<Record<string, unknown>>}
          hrefFor={(item) =>
            `/internal/demo-artifacts/scenario-packs/${encodeURIComponent(String(item.id))}`
          }
          columns={[
            {
              key: "id",
              header: "Pack",
              render: (item) => String(item.label ?? item.id),
            },
            {
              key: "description",
              header: "Description",
              render: (item) => String(item.description ?? "—"),
            },
            {
              key: "valid",
              header: "Status",
              render: (item) => (
                <ValidationBadge valid={Boolean(item.valid)} />
              ),
            },
          ]}
        />
      )}
    </DemoArtifactsPageShell>
  );
}
