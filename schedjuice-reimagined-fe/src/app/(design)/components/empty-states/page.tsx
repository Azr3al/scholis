import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/primitives/button";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";

export const metadata: Metadata = {
  title: "Empty states — Schedjuice",
};

export default function EmptyStatesPage() {
  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/components"
          className="text-sm text-text-secondary underline-offset-4 hover:text-accent hover:underline"
        >
          ← Components
        </Link>
        <h2 className="mt-3 font-serif text-3xl">Empty states</h2>
        <p className="mt-2 max-w-2xl text-text-secondary">
          Bilingual handwriting copy with dual rough underlines. Filtered states always include a
          sans recovery action.
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="font-serif text-xl">True empty</h3>
        <div className="rounded-lg border border-border bg-surface-elevated">
          <EmptyState>
            <EmptyCopy {...EMPTY_COPY_PRESETS.notEnrolled} />
          </EmptyState>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-serif text-xl">Filtered empty (search)</h3>
        <div className="rounded-lg border border-border bg-surface-elevated">
          <EmptyState
            action={
              <Button variant="secondary" size="sm" type="button">
                Clear search
              </Button>
            }
          >
            <EmptyCopy
              enBefore="No "
              enHighlight="match"
              enAfter={` for "သီရိ"`}
              myBefore={`"သီရိ" အတွက် `}
              myHighlight="မတွေ့"
              myAfter="ပါ"
            />
          </EmptyState>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-serif text-xl">Long query (underline reflow)</h3>
        <div className="max-w-xs rounded-lg border border-border bg-surface-elevated">
          <EmptyState
            action={
              <button type="button" className="text-sm text-accent hover:underline">
                Clear search
              </button>
            }
          >
            <EmptyCopy
              enBefore="No "
              enHighlight="match"
              enAfter={` for "Advanced English Composition Level 4"`}
              myBefore={`"Advanced English Composition Level 4" အတွက် `}
              myHighlight="မတွေ့"
              myAfter="ပါ"
            />
          </EmptyState>
        </div>
      </section>
    </div>
  );
}
