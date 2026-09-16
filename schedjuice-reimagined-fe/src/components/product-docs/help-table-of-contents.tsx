"use client";

import { useEffect, useState } from "react";

import type { MarkdownHeading } from "@/lib/product-docs/extract-headings";
import { cn } from "@/lib/utils";

function headingIndentClass(level: MarkdownHeading["level"]): string | undefined {
  if (level === 2) return "pl-3";
  if (level === 3) return "pl-6";
  return undefined;
}

export function HelpTableOfContents({ headings }: { headings: MarkdownHeading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length < 2) return;

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav aria-label="On this page" className="sticky top-24">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        On this page
      </p>
      <ul className="space-y-2 text-sm">
        {headings.map((h) => (
          <li key={h.id} className={headingIndentClass(h.level)}>
            <a
              href={`#${h.id}`}
              className={cn(
                "block text-muted-foreground hover:text-foreground",
                activeId === h.id && "font-medium text-foreground",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
