"use client";

import Link from "next/link";

import type { DemoStop } from "@/types/demo-artifacts";

export function DemoStopsPanel({
  stops,
  showTenantHint = true,
}: {
  stops: DemoStop[];
  showTenantHint?: boolean;
}) {
  if (!stops.length) {
    return (
      <p className="text-muted-foreground text-xs">No demo stops configured.</p>
    );
  }

  return (
    <div className="space-y-3">
      {showTenantHint ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Links open in your current tenant. Set{" "}
          <code className="text-[10px]">DEV_TENANT_DOMAIN</code> and log into
          the demo tenant before clicking through.
        </p>
      ) : null}
      <ol className="space-y-3">
        {stops.map((stop) => (
          <li
            key={`${stop.order}-${stop.route ?? "stop"}`}
            className="border border-border p-3"
          >
            <div className="flex flex-wrap items-baseline gap-2 text-xs">
              <span className="font-semibold">{stop.order}.</span>
              {stop.route ? (
                <Link
                  href={stop.route}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary underline underline-offset-2"
                >
                  {stop.route}
                </Link>
              ) : (
                <span className="text-muted-foreground">(no route)</span>
              )}
              {stop.role ? (
                <span className="text-muted-foreground">({stop.role})</span>
              ) : null}
            </div>
            {stop.talk_track ? (
              <p className="mt-2 text-xs leading-relaxed">{stop.talk_track}</p>
            ) : null}
            {stop.look_for?.length ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Look for: {stop.look_for.join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
