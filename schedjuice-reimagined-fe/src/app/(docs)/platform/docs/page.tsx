"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { PlatformDocsWelcome } from "@/components/product-docs/platform-docs-welcome";
import { fetchAdminArticles } from "@/lib/product-docs-api";

export default function PlatformDocsIndexPage() {
  const router = useRouter();
  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["platform-docs-articles"],
    queryFn: fetchAdminArticles,
  });

  useEffect(() => {
    if (isLoading || articles.length === 0) return;
    router.replace(`/platform/docs/${articles[0].id}`);
  }, [isLoading, articles, router]);

  if (isLoading) {
    return <p className="p-6 text-text-muted lg:p-8">Loading…</p>;
  }

  if (articles.length === 0) {
    return <PlatformDocsWelcome />;
  }

  return <p className="p-6 text-text-muted lg:p-8">Loading…</p>;
}
