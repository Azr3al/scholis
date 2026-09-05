"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { fetchAdminArticles, fetchAdminCategories } from "@/lib/product-docs-api";
import { cn } from "@/lib/utils";

function SidebarSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading articles">
      {[1, 2].map((group) => (
        <div key={group} className="space-y-2">
          <div className="h-3 w-16 animate-pulse rounded bg-surface-skeleton" />
          <div className="space-y-1">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-8 animate-pulse rounded-md bg-surface-skeleton" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlatformDocsSidebar() {
  const pathname = usePathname();
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["platform-docs-categories"],
    queryFn: fetchAdminCategories,
  });
  const { data: articles = [], isLoading: articlesLoading } = useQuery({
    queryKey: ["platform-docs-articles"],
    queryFn: fetchAdminArticles,
  });

  if (categoriesLoading || articlesLoading) {
    return <SidebarSkeleton />;
  }

  const articlesByCategory = categories.map((category) => ({
    category,
    articles: articles
      .filter((a) => a.category === category.id)
      .sort((a, b) => a.title.localeCompare(b.title)),
  }));

  const uncategorized = articles.filter(
    (a) => !categories.some((c) => c.id === a.category),
  );

  return (
    <nav className="space-y-5">
      {articlesByCategory.map(({ category, articles: catArticles }) => (
        <div key={category.id}>
          <p className="mb-1.5 px-2 text-xs font-medium text-text-muted">{category.title}</p>
          <ul className="space-y-0.5">
            {catArticles.map((article) => {
              const href = `/platform/docs/${article.id}`;
              const active = pathname === href;
              return (
                <li key={article.id}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]",
                      active
                        ? "bg-surface-active font-medium text-text-primary"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                    )}
                  >
                    <span className="truncate">{article.title}</span>
                    {article.status === "draft" ? (
                      <span
                        className={"inline-flex items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs font-medium text-text-secondary " + ("shrink-0 border-border-subtle px-1.5 py-0 text-[10px] font-normal text-text-muted")}
                      >
                        Draft
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {uncategorized.length > 0 ? (
        <div>
          <p className="mb-1.5 px-2 text-xs font-medium text-text-muted">Uncategorized</p>
          <ul className="space-y-0.5">
            {uncategorized.map((article) => {
              const href = `/platform/docs/${article.id}`;
              const active = pathname === href;
              return (
                <li key={article.id}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]",
                      active
                        ? "bg-surface-active font-medium text-text-primary"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                    )}
                  >
                    {article.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
