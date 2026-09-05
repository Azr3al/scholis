"use client";
import { Input, inputClassName } from "@/components/primitives";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchHelpArticles } from "@/lib/product-docs-api";
import Link from "next/link";

export function HelpSearch({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data: results = [] } = useQuery({
    queryKey: ["help-search", debounced],
    queryFn: () => fetchHelpArticles({ q: debounced }),
    enabled: debounced.length > 0,
  });

  return (
    <div className={compact ? "relative space-y-2" : "space-y-3"}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search help articles..."
      />
      {debounced.length > 0 && (
        <ul
          className={
            compact
              ? "absolute left-0 right-0 top-full z-20 mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border bg-surface-elevated p-3 shadow-md"
              : "space-y-2 rounded-lg border border-border p-3"
          }
        >
          {results.length === 0 ? (
            <li className="text-sm text-muted-foreground">No articles found.</li>
          ) : (
            results.map((article) => (
              <li key={article.id}>
                <Link
                  href={`/help/${article.slug}`}
                  className="block text-sm hover:underline"
                >
                  <span className="font-medium">{article.title}</span>
                  <span className="ml-2 text-muted-foreground">
                    {article.category_title}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
