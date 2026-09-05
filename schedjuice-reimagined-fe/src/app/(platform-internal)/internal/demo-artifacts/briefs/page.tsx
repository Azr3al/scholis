"use client";

import { Spinner } from "@/components/primitives/spinner";
import { Badge } from "@/app/_chrome/badge";
import { useEffect, useState } from "react";

import { fetchDemoArtifactBriefs } from "@/lib/demo-artifacts-api";
import type { ArtifactListItem } from "@/types/demo-artifacts";

import {
  ArtifactListTable,
  DemoArtifactsPageShell,
} from "../_components/demo-artifacts-shell";
import { ValidationBadge } from "../_components/validation-badge";

export default function BriefListPage() {
  const [items, setItems] = useState<ArtifactListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDemoArtifactBriefs()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DemoArtifactsPageShell
      title="Briefs"
      breadcrumbs={[{ label: "Briefs" }]}
    >
      {loading ? (
        <Spinner className="h-6 w-6 text-muted-foreground" />
      ) : error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <ArtifactListTable
          items={items as unknown as Array<Record<string, unknown>>}
          hrefFor={(item) =>
            `/internal/demo-artifacts/briefs/${encodeURIComponent(String(item.id))}`
          }
          columns={[
            {
              key: "id",
              header: "School",
              render: (item) => String(item.school_name ?? item.id),
            },
            {
              key: "niche",
              header: "Niche",
              render: (item) => String(item.niche ?? "—"),
            },
            {
              key: "demo_date",
              header: "Demo date",
              render: (item) => String(item.demo_date ?? "—"),
            },
            {
              key: "script",
              header: "Script",
              render: (item) =>
                item.has_generated_script ? (
                  <Badge variant="outline" className="font-normal text-[10px]">
                    Generated
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
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
