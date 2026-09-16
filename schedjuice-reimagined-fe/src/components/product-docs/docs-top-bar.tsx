"use client";
import { Button, buttonVariants } from "@/components/primitives";

import Link from "next/link";
import { Menu } from "iconoir-react";
import { useState } from "react";

import { HelpSearch } from "@/components/product-docs/help-search";

import { HelpMobileNav } from "./help-mobile-nav";

export function DocsTopBar() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <header className="border-b border-border bg-surface-elevated">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-4 lg:px-6">
          <Button
            type="button"
            variant="secondary" size="sm" className="lg:hidden"
            aria-label="Open help navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu width={18} height={18} />
          </Button>
          <div className="min-w-0 flex-1 space-y-1">
            <Link href="/home" className="text-sm text-muted-foreground hover:underline">
              ← Back to Schedjuice
            </Link>
            <p className="text-lg font-semibold">Help</p>
          </div>
          <div className="w-full sm:max-w-sm lg:w-72">
            <HelpSearch compact />
          </div>
        </div>
      </header>
      <HelpMobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
    </>
  );
}
