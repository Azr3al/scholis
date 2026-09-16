"use client";

import { PageContainer } from "@/components/layout/page-container";
import BackButton from "@/components/misc/back-button";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { emailTemplateColumns } from "@/app/(internal)/courses/[id]/email-templates/email-template-columns";
import { useEmailTemplatesList } from "@/sdk/hooks/email-templates";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const EmailTemplateListPage = () => {
  const { id } = useParams<{id: string}>();
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "email-templates",
    syncUrl: false,
  });
  const list = useEmailTemplatesList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
  });

  return (
    <PageContainer width="default" className="space-y-3">
      <div className="flex justify-between items-center">
        <BackButton href={`/courses/${id}`}></BackButton>
        <Link href={`/courses/${id}/email-templates/create`} className={cn(buttonVariants())}>Create</Link>
      </div>
      <h1 className="text-3xl font-bold">Email Templates</h1>
      <ResourceTable
        list={list}
        tableState={tableState}
        columns={emailTemplateColumns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => `${pathname}/${row.id}`}
      />
    </PageContainer>
  );
};

export default EmailTemplateListPage;
