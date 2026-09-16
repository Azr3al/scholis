"use client";

import { intakeColumns } from "@/app/(internal)/intakes/intake-columns";
import { AcademicListSurface } from "@/components/academic/academic-list-surface";
import { PageSection } from "@/components/layout/page-section";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useIntakesList } from "@/sdk/hooks/intakes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const IntakeListPage: React.FC = () => {
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "intakes",
    syncUrl: false,
  });
  const list = useIntakesList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
    expand: ["program"],
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Intakes</h1>
      ),
      actions: (
        <Link href={`${pathname}/create`}>
          <Button size="sm">Schedule intake</Button>
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
            columns={intakeColumns}
            getRowId={(row) => String(row.id)}
            rowHref={(row) => `${pathname}/${row.id}`}
          />
        </PageSection>
      </AcademicListSurface>
    </PageContainer>
  );
};

export default IntakeListPage;
