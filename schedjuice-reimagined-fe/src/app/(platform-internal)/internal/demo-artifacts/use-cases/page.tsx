"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useEffect, useState } from "react";

import { fetchDemoArtifactUseCases } from "@/lib/demo-artifacts-api";
import type { ArtifactListItem } from "@/types/demo-artifacts";

import {
  ArtifactListTable,
  DemoArtifactsPageShell,
} from "../_components/demo-artifacts-shell";
import { ValidationBadge } from "../_components/validation-badge";

export default function UseCaseListPage() {
  const [items, setItems] = useState<ArtifactListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDemoArtifactUseCases()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DemoArtifactsPageShell
      title="Use cases"
      breadcrumbs={[{ label: "Use cases" }]}
    >
      {loading ? (
        <Spinner className="h-6 w-6 text-muted-foreground" />
      ) : error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <ArtifactListTable
          items={items as unknown as Array<Record<string, unknown>>}
          hrefFor={(item) =>
            `/internal/demo-artifacts/use-cases/${encodeURIComponent(String(item.id))}`
          }
          columns={[
            {
              key: "id",
              header: "Use case",
              render: (item) => String(item.label ?? item.id),
            },
            {
              key: "stops",
              header: "Demo stops",
              render: (item) => String(item.demo_stop_count ?? "—"),
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
