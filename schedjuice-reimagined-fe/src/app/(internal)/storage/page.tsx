"use client";

import { PageContainer } from "@/components/layout/page-container";
import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageSection } from "@/components/layout/page-section";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { Skeleton } from "@/components/primitives";
import { formatBytes } from "@/helpers/bytes";
import useStrategy from "@/hooks/use-strategy";
import { ColumnStrategyType } from "@/app/artifacts/columns/types";
import { ArtifactType } from "@/app/artifacts/types";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  flexRender,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/storage/storage-table";
import { Pagination } from "@/components/data-table/parts";
import { SortableHeader } from "@/components/sortable-header/sortable-header";
import { getAttachments } from "@/helpers/attachment-api";
import { usePageHeader } from "@/components/shell/use-page-header";

const StoragePage: React.FC = () => {
  const columnStrategy = useStrategy<ColumnStrategyType>(
    ArtifactType.COLUMNS,
    "training-center",
  );

  const { data, isLoading, isFetching } = useQuery({
    refetchOnWindowFocus: false,
    queryKey: ["attachments-list"],
    queryFn: () => getAttachments(),
  });

  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data: data ? data.data.data : [],
    columns: columnStrategy?.getColumns("storage") || [],
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Storage</h1>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer width="wide">
      <PageSection dominant>
      {(isLoading || isFetching) && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-5 w-48" />
          <TableSkeleton columns={5} rows={8} showPagination />
        </div>
      )}
      {!isLoading && data && (
        <div>
          <div className="flex items-center justify-between px-2 py-2">
            <div className="text-sm font-medium text-text-primary">
              Total usage: {formatBytes(data.data.total_bytes || 0)}
            </div>
          </div>

          <Table className="w-full overflow-x-scroll">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      className="cursor-pointer select-none border border-border p-2 text-left"
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <SortableHeader header={header} />
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="border border-border p-2"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={table.getState().pagination.pageIndex + 1}
            pageSize={table.getState().pagination.pageSize}
            totalCount={data.data.data.length}
            onPageChange={(page) => table.setPageIndex(page - 1)}
          />
        </div>
      )}
      </PageSection>
    </PageContainer>
  );
};

export default StoragePage;
