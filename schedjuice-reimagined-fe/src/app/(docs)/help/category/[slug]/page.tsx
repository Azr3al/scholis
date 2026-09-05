"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { TypographyH1 } from "@/components/typography/h1";
import { fetchHelpArticles, fetchHelpCategories } from "@/lib/product-docs-api";
import type { DocCategory } from "@/types/product-docs";

export default function HelpCategoryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data: categories = [] } = useQuery({
    queryKey: ["help-categories"],
    queryFn: fetchHelpCategories,
  });

  const { data: articles = [] } = useQuery({
    queryKey: ["help-articles", slug],
    queryFn: () => fetchHelpArticles({ category: slug }),
    enabled: Boolean(slug),
  });

  const categoryFromApi = categories.find((c) => c.slug === slug);
  const category: DocCategory | undefined =
    categoryFromApi ??
    (articles.length > 0
      ? {
          id: -1,
          slug,
          title: articles[0].category_title,
          sort_order: 0,
          default_audience: "all",
          article_count: articles.length,
        }
      : undefined);

  if (!category) {
    return (
      <div className="space-y-4">
        <TypographyH1>Category not found</TypographyH1>
        <p className="text-text-muted">
          This category may not exist or you may not have access to it.
        </p>
        <Link href="/help" className="underline">
          Back to Help
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="text-sm text-text-muted">
        <Link href="/help" className="hover:underline">
          Help
        </Link>
        <span className="mx-2">/</span>
        <span>{category.title}</span>
      </nav>
      <header className="space-y-2">
        <TypographyH1>{category.title}</TypographyH1>
        <p className="text-sm text-text-muted">
          {articles.length} article{articles.length === 1 ? "" : "s"}
        </p>
      </header>
      {articles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-text-muted">
          No articles are available in this category for your role yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={`/help/${article.slug}`}
                className="text-base font-medium hover:underline"
              >
                {article.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
