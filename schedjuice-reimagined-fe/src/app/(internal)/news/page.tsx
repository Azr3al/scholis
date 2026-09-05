"use client";

import { newsColumns } from "@/app/(internal)/news/news-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/primitives";
import { TypographyH1 } from "@/components/typography/h1";
import { cn } from "@/lib/utils";
import { useNewsList } from "@/sdk/hooks/news";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BlogsPage() {
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "news",
    syncUrl: false,
  });
  const list = useNewsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
    expand: ["created_by"],
  });

  return (
    <PageContainer width="wide" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <TypographyH1>Blogs</TypographyH1>
        <Link
          className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          href={`${pathname}/create`}
        >
          Create a blog
        </Link>
      </div>
      <ResourceTable
        list={list}
        tableState={tableState}
        columns={newsColumns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => `${pathname}/${row.id}`}
      />
    </PageContainer>
  );
}
