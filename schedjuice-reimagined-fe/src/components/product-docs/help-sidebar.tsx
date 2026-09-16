"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { fetchHelpArticles, fetchHelpCategories } from "@/lib/product-docs-api";
import { cn } from "@/lib/utils";

export function HelpSidebar() {
  const pathname = usePathname();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    isError: categoriesError,
  } = useQuery({
    queryKey: ["help-categories"],
    queryFn: fetchHelpCategories,
  });
  const {
    data: articles = [],
    isLoading: articlesLoading,
    isError: articlesError,
  } = useQuery({
    queryKey: ["help-articles"],
    queryFn: () => fetchHelpArticles(),
  });

  if (categoriesLoading || articlesLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (categoriesError || articlesError) {
    return (
      <p className="text-sm text-muted-foreground">
        Navigation unavailable.
      </p>
    );
  }

  const articlesByCategory = categories.map((category) => ({
    category,
    articles: articles.filter((a) => a.category_slug === category.slug),
  }));

  return (
    <nav className="space-y-6">
      {articlesByCategory.map(({ category, articles: catArticles }) => {
        const categoryHref = `/help/category/${category.slug}`;
        const categoryActive = pathname === categoryHref;
        return (
          <div key={category.id}>
            <Link
              href={categoryHref}
              className={cn(
                "mb-2 block text-xs font-semibold uppercase tracking-wide transition-colors",
                categoryActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {category.title}
            </Link>
            <ul className="space-y-1">
              {catArticles.map((article) => {
                const href = `/help/${article.slug}`;
                const active = pathname === href;
                return (
                  <li key={article.id}>
                    <Link
                      href={href}
                      className={cn(
                        "block rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      {article.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
