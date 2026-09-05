"use client";

import { departmentColumns } from "@/app/(internal)/(department)/departments/department-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useDepartmentsList } from "@/sdk/hooks/departments";
import Link from "next/link";
import { useMemo } from "react";

const DepartmentListPage = () => {
  const tableState = useResourceTableState({
    namespace: "departments",
    syncUrl: false,
  });
  const list = useDepartmentsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Departments</h1>
      ),
      actions: (
        <Link href="/departments/create">
          <Button size="sm">Create a department</Button>
        </Link>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer width="wide">
      <ResourceTable
        list={list}
        tableState={tableState}
        columns={departmentColumns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => `/departments/${row.id}`}
      />
    </PageContainer>
  );
};
export default DepartmentListPage;
