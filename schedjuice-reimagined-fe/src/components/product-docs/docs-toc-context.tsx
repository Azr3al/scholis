"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { MarkdownHeading } from "@/lib/product-docs/extract-headings";

type DocsTocContextValue = {
  headings: MarkdownHeading[];
  setHeadings: (headings: MarkdownHeading[]) => void;
};

const DocsTocContext = createContext<DocsTocContextValue | null>(null);

export function DocsTocProvider({ children }: { children: ReactNode }) {
  const [headings, setHeadings] = useState<MarkdownHeading[]>([]);
  return (
    <DocsTocContext.Provider value={{ headings, setHeadings }}>
      {children}
    </DocsTocContext.Provider>
  );
}

export function useDocsToc() {
  const ctx = useContext(DocsTocContext);
  if (!ctx) {
    throw new Error("useDocsToc must be used within DocsTocProvider");
  }
  return ctx;
}
