"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useEffect, useState } from "react";

import { fetchDemoArtifactBlueprints } from "@/lib/demo-artifacts-api";
import type { ArtifactListItem } from "@/types/demo-artifacts";

import {
  ArtifactListTable,
  DemoArtifactsPageShell,
} from "../_components/demo-artifacts-shell";
import { ValidationBadge } from "../_components/validation-badge";

export default function BlueprintListPage() {
  const [items, setItems] = useState<ArtifactListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDemoArtifactBlueprints()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DemoArtifactsPageShell
      title="Blueprints"
      breadcrumbs={[{ label: "Blueprints" }]}
    >
      {loading ? (
        <Spinner className="h-6 w-6 text-muted-foreground" />
      ) : error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <ArtifactListTable
          items={items as unknown as Array<Record<string, unknown>>}
          hrefFor={(item) =>
            `/internal/demo-artifacts/blueprints/${encodeURIComponent(String(item.id))}`
          }
          columns={[
            {
              key: "id",
              header: "Blueprint",
              render: (item) => String(item.label ?? item.id),
            },
            {
              key: "use_cases",
              header: "Use cases",
              render: (item) => String(item.use_case_count ?? "—"),
            },
            {
              key: "packs",
              header: "Default packs",
              render: (item) => String(item.default_pack_count ?? "—"),
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
