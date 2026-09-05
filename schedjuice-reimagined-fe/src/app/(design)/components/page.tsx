// src/app/(design)/components/page.tsx
import Link from "next/link";
import { RoughCallout } from "@/components/primitives/decoration/rough-callout";
import { AsyncLoadingDemo } from "./_demos/async-loading-demo";
import { InputsDemo } from "./_demos/inputs-demo";
import { OverlaysDemo } from "./_demos/overlays-demo";
import { StructureDemo } from "./_demos/structure-demo";

export default function ComponentsIndexPage() {
  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-text-secondary">
        The Schedjuice in-house component library. Foundation tokens, type, and decoration are live;
        primitives land here as Plans 2–4 are implemented.
      </p>
      <RoughCallout>
        <p className="font-hand text-hand">
          Build on Base UI. Tokens carry the weight. No shadcn, no Radix.
        </p>
      </RoughCallout>

      <InputsDemo />
      <AsyncLoadingDemo />
      <OverlaysDemo />
      <StructureDemo />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { href: "/components/type", label: "Typography" },
          { href: "/components/color", label: "Color & tokens" },
          { href: "/components/bilingual", label: "Bilingual stress test" },
        ].map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-lg border border-border bg-surface-elevated p-4 text-text-primary hover:border-border-strong"
            >
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
