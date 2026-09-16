"use client";

import { campusColumns } from "@/app/(internal)/campuses/campus-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { PageSection } from "@/components/layout/page-section";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { useCampusesList } from "@/sdk/hooks/campuses";
import Link from "next/link";
import { usePathname } from "next/navigation";

const CampusListPage = () => {
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "campuses",
    syncUrl: false,
  });
  const list = useCampusesList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
  });

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Campuses"
        description="Physical and online campuses available for scheduling and enrollment."
        actions={
          <Link
            href={`${pathname}/create`}
            className={cn(buttonVariants({ variant: "primary", size: "md" }))}
          >
            Create a campus
          </Link>
        }
      />
      <PageSection dominant>
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={campusColumns}
          getRowId={(row) => String(row.id)}
          rowHref={(row) => `/campuses/${row.id}`}
        />
      </PageSection>
    </PageContainer>
  );
};
export default CampusListPage;
