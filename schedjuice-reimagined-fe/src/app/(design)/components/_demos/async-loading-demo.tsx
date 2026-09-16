"use client";

import { useState } from "react";

import { ComboboxOptionRowsSkeleton } from "@/components/form/combobox-option-rows-skeleton";
import { SearchField } from "@/components/form/search-field";
import { Button } from "@/components/primitives/button";
import {
  AsyncContentPanel,
  AsyncContentPanelRow,
  type AsyncPanelState,
} from "@/components/loading/async-content-panel";

const STATES: AsyncPanelState[] = [
  "idle",
  "hint",
  "loading",
  "empty",
  "error",
  "ready",
];

export function AsyncLoadingDemo() {
  const [panelState, setPanelState] = useState<AsyncPanelState>("hint");
  const [isFetching, setIsFetching] = useState(false);

  return (
    <section className="space-y-6">
      <h2 className="font-serif text-2xl">Async loading &amp; search</h2>
      <p className="max-w-2xl text-sm text-text-secondary">
        Shared patterns from DESIGN.md §12: crossfade panel states, structured skeletons, and
        search-field fetch indicators. Stable-height panels prevent layout shift while states change.
        Motion recipes come from <code>@/lib/sj/motion.ts</code> only.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="font-mono text-mono-sm text-text-muted">SearchField</h3>
          <SearchField
            placeholder="Search by name or email"
            isFetching={isFetching}
            defaultValue=""
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsFetching((value) => !value)}
          >
            Toggle fetch indicator
          </Button>
        </div>

        <div className="space-y-3">
          <h3 className="font-mono text-mono-sm text-text-muted">AsyncContentPanel</h3>
          <div className="flex flex-wrap gap-2">
            {STATES.map((state) => (
              <Button
                key={state}
                type="button"
                variant={panelState === state ? "primary" : "secondary"}
                size="sm"
                onClick={() => setPanelState(state)}
              >
                {state}
              </Button>
            ))}
          </div>
          <AsyncContentPanel
            state={panelState}
            ariaBusy={panelState === "loading"}
            stableHeight="popover"
            idle="Choose a filter to start."
            hint="Type at least 2 characters to search."
            loading={<ComboboxOptionRowsSkeleton rows={5} />}
            empty="No results."
            error="Couldn't load results."
            staggerResults
          >
            <div className="divide-y divide-border/60">
              {["Alice Ng", "Bob Tun", "Carol Mya"].map((name) => (
                <AsyncContentPanelRow
                  key={name}
                  className="px-4 py-3 text-sm text-text-primary"
                >
                  {name}
                </AsyncContentPanelRow>
              ))}
            </div>
          </AsyncContentPanel>
        </div>
      </div>
    </section>
  );
}
