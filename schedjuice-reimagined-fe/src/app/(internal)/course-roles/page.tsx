"use client";

import { courseRoleColumns } from "@/app/(internal)/course-roles/course-role-columns";
import { AcademicListSurface } from "@/components/academic/academic-list-surface";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useAssignedAsRolesList } from "@/sdk/hooks/assigned-as-roles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const AssignedAsRoleListPage = () => {
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "course-roles",
    syncUrl: false,
  });
  const list = useAssignedAsRolesList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Course roles</h1>
      ),
      actions: (
        <Link href={`${pathname}/create`}>
          <Button size="sm">Create course role</Button>
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
            columns={courseRoleColumns}
            getRowId={(row) => String(row.id)}
            rowHref={(row) => `${pathname}/${row.id}`}
          />
        </PageSection>
      </AcademicListSurface>
    </PageContainer>
  );
};

export default AssignedAsRoleListPage;
