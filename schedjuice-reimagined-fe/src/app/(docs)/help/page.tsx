"use client";

import { useQuery } from "@tanstack/react-query";

import { HelpCategoryCard } from "@/components/product-docs/help-category-card";
import { HelpSearch } from "@/components/product-docs/help-search";
import { TypographyH1 } from "@/components/typography/h1";
import { Button } from "@/components/primitives";
import { fetchHelpArticles, fetchHelpCategories } from "@/lib/product-docs-api";
import type { DocCategory } from "@/types/product-docs";

export default function HelpHomePage() {
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["help-categories"],
    queryFn: fetchHelpCategories,
  });
  const {
    data: articles = [],
    isLoading: articlesLoading,
    isError: articlesError,
    refetch: refetchArticles,
  } = useQuery({
    queryKey: ["help-articles"],
    queryFn: () => fetchHelpArticles(),
  });

  const isLoading = categoriesLoading || articlesLoading;
  const isError = categoriesError || articlesError;

  const articlesByCategorySlug = articles.reduce<
    Record<string, typeof articles>
  >((acc, article) => {
    const key = article.category_slug;
    acc[key] = acc[key] ?? [];
    acc[key].push(article);
    return acc;
  }, {});

  const fallbackCategories: DocCategory[] = Object.entries(
    articlesByCategorySlug,
  ).map(([slug, catArticles]) => ({
    id: -1,
    slug,
    title: catArticles[0]?.category_title ?? slug,
    sort_order: 0,
    default_audience: "all",
    article_count: catArticles.length,
  }));

  const displayCategories =
    categories.length > 0 ? categories : fallbackCategories;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <TypographyH1>Help</TypographyH1>
        <p className="text-text-secondary">
          Step-by-step guides for using Schedjuice in your school.
        </p>
      </header>

      <HelpSearch />

      {isLoading ? (
        <p className="text-text-muted">Loading…</p>
      ) : isError ? (
        <div className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger/5 p-6">
          <p className="text-sm text-danger">
            Could not load documentation. Please try again.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void refetchCategories();
              void refetchArticles();
            }}
          >
            Retry
          </Button>
        </div>
      ) : displayCategories.length === 0 && articles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-text-muted">
          Documentation is being prepared. Check back soon.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {displayCategories.map((category) => {
            const catArticles = articles.filter(
              (a) => a.category_slug === category.slug,
            );
            return (
              <HelpCategoryCard
                key={category.slug}
                category={category}
                articleCount={
                  catArticles.length || category.article_count || 0
                }
                primaryArticleSlug={
                  catArticles.length === 1 ? catArticles[0]?.slug : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
