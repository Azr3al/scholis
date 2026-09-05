"use client";

import { usePathname } from "next/navigation";

import { DocsTopBar } from "./docs-top-bar";
import { DocsTocProvider, useDocsToc } from "./docs-toc-context";
import { HelpSidebar } from "./help-sidebar";
import { HelpTableOfContents } from "./help-table-of-contents";

function DocsShellInner({ children }: { children: React.ReactNode }) {
  const { headings } = useDocsToc();

  return (
    <div className="sj-root min-h-svh bg-surface-sunken text-text-primary">
      <DocsTopBar />
      <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 py-6 lg:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24">
            <HelpSidebar />
          </div>
        </aside>
        {children}
        {headings.length >= 2 ? (
          <aside className="hidden w-56 shrink-0 xl:block">
            <HelpTableOfContents headings={headings} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function DocsShell({ children }: { children: React.ReactNode }) {
  return (
    <DocsTocProvider>
      <DocsShellInner>{children}</DocsShellInner>
    </DocsTocProvider>
  );
}
