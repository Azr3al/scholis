"use client";
import { cn } from "@/lib/utils";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, makeGetRequest } from "@/app/client-api/utils";
import {
  getEmailEditorOptions,
} from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import AuditDisplay from "@/components/misc/audit-display";
import BackButton from "@/components/misc/back-button";
import { Button, buttonVariants, useToast } from "@/components/primitives";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/courses/ui/card";
import {
  ResourceTable,
  column,
  useResourceTableState,
  type Column,
} from "@/components/data-table";
import { operatorEnum } from "@/types/api";
import type { UserEmail } from "@/sdk";
import { useUserEmailsList } from "@/sdk/hooks/user-emails";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEditor } from "@tiptap/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";

const EmailTemplateDetailsPage = () => {
  const toast = useToast();
  const { id, templateId } = useParams<{id: string, templateId: string}>();
  const getEmailTemplate = useQuery({
    queryKey: ["getEmailTemplate", templateId],
    queryFn: () => {
      return fetchEntity("email-templates", templateId, ["created_by"]);
    },
  });
  const editor = useEditor(getEmailEditorOptions());

  const filterParams = useMemo(
    () => [
      {
        field_name: "email_template",
        value: templateId,
        operator: operatorEnum.exact,
      },
    ],
    [templateId],
  );
  const tableState = useResourceTableState({
    namespace: "user-emails",
    syncUrl: false,
    initial: { sorts: ["-created_at"], pageSize: 1000 },
  });
  const list = useUserEmailsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["-created_at"],
    q: tableState.q,
    fields: ["id", "user.id", "user.name", "user.email", "is_sent"],
    expand: ["user"],
    filterParams,
  });

  const sendEmailMutation = useMutation({
    mutationKey: ["sendEmailTemplate"],
    mutationFn: (data: { all: boolean }) => {
      return makeGetRequest(`email-templates/${templateId}/send`, {
        all: data.all,
      });
    },
    onSuccess: () => {
      toast.add({ description: "Emails sent successfully" });
      list.refetch();
    },
  });

  const columns: Column<UserEmail>[] = useMemo(
    () => [
      column.text<UserEmail>({
        id: "user_name",
        header: "User Name",
        accessor: (row) => row.user?.name,
      }),
      column.text<UserEmail>({
        id: "user_email",
        header: "User Email",
        accessor: (row) => row.user?.email,
      }),
      column.text<UserEmail>({
        id: "is_sent",
        header: "Sent",
        accessor: (row) => (row.is_sent ? "Sent" : "Not Sent"),
      }),
      column.date<UserEmail>({
        id: "created_at",
        header: "Created At",
        accessor: (row) => row.created_at,
      }),
    ],
    [],
  );

  useEffect(() => {
    if (getEmailTemplate.data) {
      editor?.commands.setContent(getEmailTemplate.data?.data.data.body);
    }
  }, [getEmailTemplate.data, getEmailTemplate.isSuccess, editor]);

  return (
    <PageContainer width="default" className="space-y-3">
      <div className="flex gap-3 items-center justify-between">
        <BackButton href={`/courses/${id}/email-templates`}></BackButton>
        <div className="space-x-3">
          <Link
            href={`/courses/${id}/email-templates/${templateId}/user-emails`}
            className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          >
            Emails
          </Link>
          <Link
            href={`/courses/${id}/email-templates/${templateId}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          >
            Edit
          </Link>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{getEmailTemplate.data?.data.data.name}</CardTitle>
          <CardDescription>
            <AuditDisplay
              created_at={getEmailTemplate.data?.data.data.created_at}
              updated_at={getEmailTemplate.data?.data.data.updated_at}
              created_by={getEmailTemplate.data?.data.data.created_by}
            ></AuditDisplay>
          </CardDescription>
        </CardHeader>
        <CardContent></CardContent>
      </Card>
      <p>
        Subject:{" "}
        {
          <span className="font-bold text-xl">
            {getEmailTemplate.data?.data.data.subject}
          </span>
        }
      </p>
      {editor && (
        <TextEditor
          editor={editor}
          editable={false}
          hideMenu={true}
        ></TextEditor>
      )}

      <div className="flex justify-end gap-3">
        <Button
          onClick={() => {
            sendEmailMutation.mutate({ all: true });
          }}
          variant={"secondary"}
          type="button"
          isLoading={sendEmailMutation.isPending}
        >
          Send to all
        </Button>
        <Button
          onClick={() => {
            sendEmailMutation.mutate({ all: false });
          }}
          isLoading={sendEmailMutation.isPending}
        >
          Send to unsent users
        </Button>
      </div>
      <ResourceTable
        list={list}
        tableState={tableState}
        columns={columns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) =>
          `/courses/${id}/email-templates/${templateId}/user-emails/${row.id}`
        }
      />
    </PageContainer>
  );
};

export default EmailTemplateDetailsPage;
