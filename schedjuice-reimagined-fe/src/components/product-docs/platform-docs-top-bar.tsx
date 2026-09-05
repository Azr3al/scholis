"use client";
import { Button, buttonVariants } from "@/components/primitives";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "iconoir-react";
import { useState } from "react";

import { PlatformDocsMobileNav } from "./platform-docs-mobile-nav";

type PlatformDocsTopBarProps = {
  onAddCategory?: () => void;
};

export function PlatformDocsTopBar({ onAddCategory }: PlatformDocsTopBarProps) {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <header className="border-b border-border bg-surface-elevated">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
          <Button
            type="button"
            variant="secondary" size="sm" className="lg:hidden"
            aria-label="Open docs navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu width={18} height={18} />
          </Button>
          <div className="min-w-0 flex-1 space-y-1">
            <Link href="/home" className="text-sm text-muted-foreground hover:underline">
              ← Back to Schedjuice
            </Link>
            <p className="text-base font-semibold text-text-primary">Product docs</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onAddCategory ? (
              <Button type="button" variant="secondary" onClick={onAddCategory}>
                Add category
              </Button>
            ) : null}
            <Button type="button" onClick={() => router.push("/platform/docs/new")}>
              New article
            </Button>
          </div>
        </div>
      </header>
      <PlatformDocsMobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
    </>
  );
}
