"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import { filterShortcutToolsForUser } from "@/config/shortcuts-tools";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useMemo } from "react";

const ShortcutsHubPage = () => {
  const { user, isLoading } = useUser();
  const { tenant } = useTenant();

  const tiles = filterShortcutToolsForUser(user, tenant);

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Shortcuts</h1>
      ),
    }),
    [],
  );
  usePageHeader(!isLoading && user ? headerConfig : null);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-text-muted" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <PageContainer width="default" className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-text-secondary">
        Quick links to tools for day-to-day work. What you see depends on your
        role.
      </p>
      {tiles.length === 0 ? (
        <p className="rounded-xl border border-border py-8 text-center text-sm text-text-muted">
          No shortcuts are available for your account.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className={cn(
                  "group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                )}
              >
                <div className="flex h-full min-h-[140px] flex-col gap-3 rounded-xl border border-border bg-surface p-6 transition-colors hover:bg-surface-hover">
                  <div className="flex size-11 items-center justify-center rounded-lg border border-border bg-surface-hover">
                    <Icon className="size-5 text-text-primary" aria-hidden />
                  </div>
                  <h2 className="text-lg leading-tight font-semibold text-text-primary">
                    {tool.title}
                  </h2>
                  <p className="line-clamp-3 text-sm text-text-secondary">
                    {tool.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
};

export default ShortcutsHubPage;
