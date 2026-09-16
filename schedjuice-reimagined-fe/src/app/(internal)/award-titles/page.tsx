"use client";

import { PageContainer } from "@/components/layout/page-container";
import { Button, buttonVariants } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { listAwardTitles } from "@/lib/awards-api";
import { cn } from "@/lib/utils";
import { formatAwardFamily, type AwardTitle } from "@/types/award";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

function originLabel(origin: AwardTitle["origin"]): string {
  if (origin === "admin") return "Admin";
  if (origin === "promoted") return "Promoted";
  return "Local";
}

const AwardTitlesPage: React.FC = () => {
  const list = useQuery({
    queryKey: ["award-titles"],
    queryFn: listAwardTitles,
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Award titles</h1>
      ),
      actions: (
        <Link href="/award-titles/create">
          <Button size="sm">Create award title</Button>
        </Link>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  const rows = list.data ?? [];

  return (
    <PageContainer width="wide">
      {list.isError ? (
        <p className="text-sm text-danger">Could not load award titles.</p>
      ) : null}
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left">
              <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                Name
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                Family
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                Pinned
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                Origin
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                Retired
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr>
                <td className="px-3 py-6 text-text-muted" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-text-muted" colSpan={6}>
                  No award titles yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle">
                  <td className="px-3 py-2 align-middle font-medium text-text-primary">
                    {row.name}
                  </td>
                  <td className="px-3 py-2 align-middle text-text-secondary">
                    {formatAwardFamily(row.family)}
                  </td>
                  <td className="px-3 py-2 align-middle text-text-secondary">
                    {row.is_pinned ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2 align-middle text-text-secondary">
                    {originLabel(row.origin)}
                  </td>
                  <td className="px-3 py-2 align-middle text-text-secondary">
                    {row.retired_at ? "Retired" : "Active"}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <Link
                      href={`/award-titles/${row.id}/edit`}
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                      )}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
};

export default AwardTitlesPage;
