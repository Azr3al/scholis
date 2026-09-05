"use client";

import { PageContainer } from "@/components/layout/page-container";
import Link from "next/link";
import { ReactNode } from "react";

import { ValidationBadge } from "./validation-badge";

export function DemoArtifactsGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function DemoArtifactsPageShell({
  title,
  description,
  breadcrumbs,
  children,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Array<{ href?: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <DemoArtifactsGate>
      <PageContainer width="default" className="font-mono text-sm min-h-[70vh]">
        <nav className="text-[11px] text-muted-foreground mb-4 flex flex-wrap gap-1">
          <Link href="/internal/demo-artifacts" className="hover:underline">
            Demo Artifacts
          </Link>
          {breadcrumbs?.map((crumb) => (
            <span key={crumb.label} className="flex items-center gap-1">
              <span>/</span>
              {crumb.href ? (
                <Link href={crumb.href} className="hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
        <div className="border-b border-border pb-4 mb-6">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </PageContainer>
    </DemoArtifactsGate>
  );
}

export function ArtifactDetailHeader({
  id,
  valid,
  relativePath,
}: {
  id: string;
  valid: boolean;
  relativePath: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <h2 className="text-base font-semibold">{id}</h2>
      <ValidationBadge valid={valid} />
      <span className="text-[11px] text-muted-foreground ml-auto">
        demo-artifacts/{relativePath}
      </span>
    </div>
  );
}

export function KeyValueTable({
  rows,
}: {
  rows: Array<{ key: string; value: ReactNode }>;
}) {
  return (
    <dl className="border border-border divide-y divide-border text-xs">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2">
          <dt className="text-muted-foreground">{row.key}</dt>
          <dd className="break-words min-w-0">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LinkedItemList({
  items,
  hrefFor,
  emptyLabel = "—",
}: {
  items: string[];
  hrefFor: (item: string) => string;
  emptyLabel?: string;
}) {
  if (!items.length) {
    return <span className="text-muted-foreground">{emptyLabel}</span>;
  }

  return (
    <ul className="list-disc space-y-1 pl-4">
      {items.map((item) => (
        <li key={item}>
          <Link
            href={hrefFor(item)}
            className="underline underline-offset-2 hover:text-primary"
          >
            {item}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ArtifactListTable({
  items,
  hrefFor,
  columns,
}: {
  items: Array<Record<string, unknown>>;
  hrefFor: (item: Record<string, unknown>) => string;
  columns: Array<{
    key: string;
    header: string;
    render: (item: Record<string, unknown>) => ReactNode;
  }>;
}) {
  if (!items.length) {
    return <p className="text-muted-foreground text-xs">No artifacts found.</p>;
  }

  return (
    <div className="border border-border overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-left">
            {columns.map((column) => (
              <th key={column.key} className="px-3 py-2 font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={String(item.id)} className="border-b border-border last:border-0">
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-2 align-top">
                  {column.key === "id" ? (
                    <Link href={hrefFor(item)} className="font-medium hover:underline">
                      {column.render(item)}
                    </Link>
                  ) : (
                    column.render(item)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
