"use client";

import { useState } from "react";

import { PlatformDocsCategoryDialog } from "@/components/product-docs/platform-docs-category-dialog";

import { PlatformDocsSidebar } from "./platform-docs-sidebar";
import { PlatformDocsTopBar } from "./platform-docs-top-bar";

export function PlatformDocsShell({ children }: { children: React.ReactNode }) {
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  return (
    <div className="sj-root flex h-svh flex-col overflow-hidden bg-surface-sunken text-text-primary">
      <PlatformDocsTopBar onAddCategory={() => setCategoryDialogOpen(true)} />
      <PlatformDocsCategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 gap-4 px-4 py-4 lg:gap-6 lg:px-6 lg:py-6">
        <aside className="hidden w-52 shrink-0 self-start lg:block">
          <div className="rounded-xl border border-border bg-surface-elevated p-3 shadow-sm">
            <PlatformDocsSidebar />
          </div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-sm">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}
