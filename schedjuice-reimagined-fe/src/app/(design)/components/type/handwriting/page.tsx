import type { Metadata } from "next";
import Link from "next/link";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";

export const metadata: Metadata = {
  title: "Handwriting — Schedjuice",
};

const STACK = [
  {
    role: "Latin",
    face: "Architects Daughter",
    file: "architects-daughter-latin-400.woff2",
  },
  {
    role: "Myanmar",
    face: "Sai K2 Handwriting",
    file: "saik2-handwriting-regular.ttf",
  },
] as const;

export default function HandwritingPage() {
  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/components/type"
          className="text-sm text-text-secondary underline-offset-4 hover:text-accent hover:underline"
        >
          ← Type scale
        </Link>
        <h2 className="mt-3 font-serif text-3xl">Schedjuice Hand</h2>
        <p className="mt-2 max-w-2xl text-text-secondary">
          Accent-only handwriting for 3–5 moments per surface. Routed via{" "}
          <code className="font-mono text-xs">unicode-range</code> into a single{" "}
          <code className="font-mono text-xs">font-hand</code> token — never body, nav, table
          cells, or form controls.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="font-serif text-xl">Stack</h3>
        <table className="w-full max-w-xl border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border-strong">
              <th className="py-2 font-medium text-text-muted">Script</th>
              <th className="py-2 font-medium text-text-muted">Face</th>
              <th className="py-2 font-medium text-text-muted">File</th>
            </tr>
          </thead>
          <tbody>
            {STACK.map(({ role, face, file }) => (
              <tr key={role} className="border-b border-border">
                <td className="py-3">{role}</td>
                <td className="py-3">{face}</td>
                <td className="py-3 font-mono text-xs text-text-muted">{file}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-4">
        <h3 className="font-serif text-xl">In context</h3>

        <div className="rounded-lg border border-border bg-surface-elevated p-5">
          <p className="text-xs text-text-muted">Brand mark</p>
          <p className="font-hand text-hand text-brand">Schedjuice</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated p-5">
          <p className="text-xs text-text-muted">Course row accent</p>
          <p className="font-mono text-xs text-text-muted">ENG-301 · Mon 09:00</p>
          <p className="mt-1 font-serif text-lg text-text-primary">English Composition</p>
          <p className="mt-1 font-hand text-hand text-brand">
            Your class · သင်တန်း
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated p-5">
          <p className="text-xs text-text-muted">Encouragement callout</p>
          <p className="font-hand text-hand text-brand">
            Keep going — great work! · ဆက်လက်ကြိုးစားပါ
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-elevated p-5">
          <p className="text-xs text-text-muted">Empty state</p>
          <EmptyState className="py-6">
            <EmptyCopy {...EMPTY_COPY_PRESETS.nothingHere} />
          </EmptyState>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-serif text-xl">Scale token</h3>
        <p className="font-hand text-hand text-brand">The quiet classroom</p>
        <p className="text-xs text-text-muted">
          <code className="font-mono">--text-hand</code> · fluid clamp · use with{" "}
          <code className="font-mono">text-brand</code> for decorative handwriting only
          (not body or status labels — soft green fails AA on cream)
        </p>
      </section>
    </div>
  );
}
