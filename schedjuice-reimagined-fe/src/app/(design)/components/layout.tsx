// src/app/(design)/components/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { PaperGrain } from "@/components/primitives/decoration/paper-grain";
import { ThemeToggle } from "@/components/primitives/theme-toggle";

const SECTIONS = [
  { href: "/components", label: "Components" },
  { href: "/components/type", label: "Type" },
  { href: "/components/type/handwriting", label: "Handwriting" },
  { href: "/components/empty-states", label: "Empty states" },
  { href: "/components/color", label: "Color" },
  { href: "/components/bilingual", label: "Bilingual" },
];

export default function ComponentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="sj-root relative min-h-screen bg-surface text-text-primary antialiased">
      <PaperGrain />
      <div className="relative z-10 mx-auto max-w-5xl px-6 py-10">
        <header className="mb-10 flex items-baseline justify-between gap-6">
          <div>
            <p className="font-hand text-hand text-brand">Schedjuice</p>
            <h1 className="font-serif text-3xl text-text-primary">Component library</h1>
          </div>
          <ThemeToggle />
        </header>
        <nav className="mb-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="text-text-secondary underline-offset-4 hover:text-accent hover:underline"
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
