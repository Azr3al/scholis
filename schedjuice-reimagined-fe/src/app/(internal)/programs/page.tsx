"use client";

import { programColumns } from "@/app/(internal)/programs/program-columns";
import { AcademicListSurface } from "@/components/academic/academic-list-surface";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useProgramsList } from "@/sdk/hooks/programs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const ProgramListPage: React.FC = () => {
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "programs",
    syncUrl: false,
  });
  const list = useProgramsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Programs</h1>
      ),
      actions: (
        <Link href={`${pathname}/create`}>
          <Button size="sm">Create program</Button>
        </Link>
      ),
    }),
    [pathname],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer width="wide">
      <AcademicListSurface>
        <PageSection dominant>
          <ResourceTable
            list={list}
            tableState={tableState}
            columns={programColumns}
            getRowId={(row) => String(row.id)}
            rowHref={(row) => `${pathname}/${row.id}`}
          />
        </PageSection>
      </AcademicListSurface>
    </PageContainer>
  );
};

export default ProgramListPage;
