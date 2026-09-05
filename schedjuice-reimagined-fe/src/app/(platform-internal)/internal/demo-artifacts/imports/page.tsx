"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useEffect, useState } from "react";

import { fetchDemoArtifactImports } from "@/lib/demo-artifacts-api";
import type { ArtifactListItem } from "@/types/demo-artifacts";

import {
  ArtifactListTable,
  DemoArtifactsPageShell,
  LinkedItemList,
} from "../_components/demo-artifacts-shell";
import { ValidationBadge } from "../_components/validation-badge";

export default function ImportListPage() {
  const [items, setItems] = useState<ArtifactListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDemoArtifactImports()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DemoArtifactsPageShell
      title="Imports"
      breadcrumbs={[{ label: "Imports" }]}
    >
      {loading ? (
        <Spinner className="h-6 w-6 text-muted-foreground" />
      ) : error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <ArtifactListTable
          items={items as unknown as Array<Record<string, unknown>>}
          hrefFor={(item) =>
            `/internal/demo-artifacts/imports/${encodeURIComponent(String(item.id))}`
          }
          columns={[
            {
              key: "id",
              header: "File",
              render: (item) => String(item.filename ?? item.id),
            },
            {
              key: "briefs",
              header: "Linked briefs",
              render: (item) => {
                const briefs = item.linked_briefs as string[] | undefined;
                return (
                  <LinkedItemList
                    items={briefs ?? []}
                    hrefFor={(slug) =>
                      `/internal/demo-artifacts/briefs/${encodeURIComponent(slug)}`
                    }
                  />
                );
              },
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
