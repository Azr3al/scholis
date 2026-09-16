"use client";

import Link from "next/link";

import type { DocCategory } from "@/types/product-docs";

export function HelpCategoryCard({
  category,
  articleCount,
  primaryArticleSlug,
}: {
  category: DocCategory;
  articleCount: number;
  primaryArticleSlug?: string;
}) {
  const href =
    articleCount === 1 && primaryArticleSlug
      ? `/help/${primaryArticleSlug}`
      : `/help/category/${category.slug}`;

  return (
    <Link
      href={href}
      className="block rounded-xl border border-border p-5 transition-colors hover:bg-accent/30"
    >
      <h2 className="text-lg font-semibold">{category.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {articleCount} article{articleCount === 1 ? "" : "s"}
      </p>
      <span className="mt-4 inline-block text-sm font-medium underline">
        {articleCount === 1 ? "Read article" : "Browse category"}
      </span>
    </Link>
  );
}
