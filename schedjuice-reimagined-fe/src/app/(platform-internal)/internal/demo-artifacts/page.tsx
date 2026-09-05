"use client";

import { Spinner } from "@/components/primitives/spinner";
import { Page as FileStack } from "iconoir-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchDemoArtifactsHub } from "@/lib/demo-artifacts-api";
import type { DemoArtifactHub } from "@/types/demo-artifacts";

import { DemoArtifactsPageShell } from "./_components/demo-artifacts-shell";

const CARDS = [
  { key: "briefs", href: "/internal/demo-artifacts/briefs", label: "Briefs" },
  {
    key: "blueprints",
    href: "/internal/demo-artifacts/blueprints",
    label: "Blueprints",
  },
  {
    key: "scenario_packs",
    href: "/internal/demo-artifacts/scenario-packs",
    label: "Scenario packs",
  },
  {
    key: "use_cases",
    href: "/internal/demo-artifacts/use-cases",
    label: "Use cases",
  },
  { key: "imports", href: "/internal/demo-artifacts/imports", label: "Imports" },
] as const;

export default function DemoArtifactsHubPage() {
  const [hub, setHub] = useState<DemoArtifactHub | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDemoArtifactsHub()
      .then(setHub)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <DemoArtifactsPageShell
      title="Demo Artifacts"
      description="Browse version-controlled demo blueprints, briefs, scenario packs, use-cases, and imports from the backend filesystem."
    >
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : !hub ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {CARDS.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              className="border border-border p-4 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-start gap-2">
                <FileStack className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">{card.label}</div>
                  <div className="text-muted-foreground text-xs mt-1">
                    {hub.counts[card.key]} artifact
                    {hub.counts[card.key] === 1 ? "" : "s"}
                    {card.key === "briefs" &&
                    hub.counts.briefs_with_generated_script > 0
                      ? ` · ${hub.counts.briefs_with_generated_script} with generated script`
                      : ""}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </DemoArtifactsPageShell>
  );
}
