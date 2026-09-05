"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import MarkdownRenderer from "@/components/markdown/markdown-renderer";
import BackButton from "@/components/misc/back-button";
import { useDocsToc } from "@/components/product-docs/docs-toc-context";
import { HelpArticleEditButton } from "@/components/product-docs/help-article-edit-button";
import { HelpArticleNav } from "@/components/product-docs/help-article-nav";
import { HelpSectionLinks } from "@/components/product-docs/help-section-links";
import { TypographyH1 } from "@/components/typography/h1";
import { extractMarkdownHeadings } from "@/lib/product-docs/extract-headings";
import { fetchHelpArticle, fetchHelpArticles } from "@/lib/product-docs-api";

export default function HelpArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { setHeadings } = useDocsToc();

  const { data: article, isLoading, isError } = useQuery({
    queryKey: ["help-article", slug],
    queryFn: () => fetchHelpArticle(slug),
    retry: false,
  });

  const { data: categoryArticles = [] } = useQuery({
    queryKey: ["help-articles", article?.category_slug],
    queryFn: () => fetchHelpArticles({ category: article!.category_slug }),
    enabled: Boolean(article?.category_slug),
  });

  const headings = useMemo(
    () => extractMarkdownHeadings(article?.markdown_body ?? ""),
    [article?.markdown_body],
  );

  useEffect(() => {
    setHeadings(headings);
    return () => setHeadings([]);
  }, [headings, setHeadings]);

  if (isLoading) {
    return <p className="text-text-muted">Loading…</p>;
  }

  if (isError || !article) {
    return (
      <div className="space-y-4">
        <TypographyH1>Article not found</TypographyH1>
        <p className="text-text-muted">
          This article may not exist or you may not have access to it.
        </p>
        <Link href="/help" className="underline">
          Back to Help
        </Link>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <BackButton
        href={`/help/category/${article.category_slug}`}
        label={`Back to ${article.category_title}`}
      />
      <nav className="text-sm text-text-muted">
        <Link href="/help" className="hover:underline">
          Help
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/help/category/${article.category_slug}`} className="hover:underline">
          {article.category_title}
        </Link>
        <span className="mx-2">/</span>
        <span>{article.title}</span>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <TypographyH1>{article.title}</TypographyH1>
          {article.updated_at && (
            <p className="text-sm text-text-muted">
              Updated {new Date(article.updated_at).toLocaleDateString()}
            </p>
          )}
        </div>
        <HelpArticleEditButton articleId={article.id} />
      </header>
      <HelpSectionLinks slug={slug} headings={headings} />
      <MarkdownRenderer
        value={article.markdown_body ?? ""}
        showHeadingAnchors
      />
      <HelpArticleNav articles={categoryArticles} currentSlug={article.slug} />
    </article>
  );
}
