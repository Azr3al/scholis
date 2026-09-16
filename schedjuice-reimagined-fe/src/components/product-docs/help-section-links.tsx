"use client";
import { Button, buttonVariants, useToast } from "@/components/primitives";

import { Copy, ClipboardCheck as CopyCheck } from "iconoir-react";
import { useEffect, useState } from "react";

import type { MarkdownHeading } from "@/lib/product-docs/extract-headings";
import { cn } from "@/lib/utils";

type HelpSectionLinksProps = {
  slug: string;
  headings: MarkdownHeading[];
};

function headingIndentClass(level: MarkdownHeading["level"]): string | undefined {
  if (level === 2) return "pl-3";
  if (level === 3) return "pl-6";
  return undefined;
}

function SectionLinkRow({ url, label }: { url: string; label: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.add({ description: "Link copied to clipboard" });
      setTimeout(() => setCopied(false), 1000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{label}</p>
        <p className="truncate text-xs text-text-muted">{url}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm" className="shrink-0"
        aria-label={`Copy link to ${label}`}
        onClick={handleCopy}
      >
        {copied ? <CopyCheck className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

export function HelpSectionLinks({ slug, headings }: HelpSectionLinksProps) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (headings.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-text-primary">Section links</h2>
      <p className="mt-0.5 text-sm text-text-muted">
        Copy a link to share a specific part of this tutorial.
      </p>
      <ul className="mt-4 space-y-3">
        {headings.map((heading) => {
          const url = origin ? `${origin}/help/${slug}#${heading.id}` : `/help/${slug}#${heading.id}`;
          return (
            <li key={heading.id} className={cn(headingIndentClass(heading.level))}>
              <SectionLinkRow url={url} label={heading.text} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
