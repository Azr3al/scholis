"use client";

import type { BriefDetail, DemoStop } from "@/types/demo-artifacts";

import { DemoStopsPanel } from "./demo-stops-panel";
import { SourcePanel } from "./source-panel";

export function DemoScriptSection({ detail }: { detail: BriefDetail }) {
  const scriptStops: DemoStop[] =
    detail.generated_script?.available && detail.generated_script.json?.stops
      ? detail.generated_script.json.stops
      : detail.resolved?.demo_stops ?? [];

  return (
    <section>
      <h3 className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">
        {detail.generated_script?.available ? "Demo script" : "Demo stops"}
      </h3>
      {detail.generated_script?.available && detail.generated_script.partial ? (
        <p className="text-amber-600 text-xs mb-2">
          Partial script on server — only one of JSON/Markdown is present.
        </p>
      ) : null}
      <DemoStopsPanel stops={scriptStops} showTenantHint={false} />
      {detail.generated_script?.available && detail.generated_script.markdown ? (
        <SourcePanel
          label="View full script"
          source={{
            format: "markdown",
            content: detail.generated_script.markdown,
          }}
        />
      ) : null}
    </section>
  );
}
