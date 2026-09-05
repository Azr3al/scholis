"use client";

import { createStudentRegistrationColumns } from "@/app/(internal)/student-registration/student-registration-columns";
import { deleteEntity, makeGetRequest } from "@/app/client-api/utils";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { useToast } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { queryClient } from "@/lib/query";
import { useUsersList } from "@/sdk/hooks/users";
import { operatorEnum } from "@/types/api";
import { useMutation } from "@tanstack/react-query";
import { useMemo } from "react";

const StudentRegistrationPage = () => {
  const toast = useToast();
  const tableState = useResourceTableState({
    namespace: "user-request-list",
    syncUrl: false,
    initial: { sorts: ["-created_at"] },
  });

  const filterParams = useMemo(
    () => [
      {
        field_name: "is_active",
        value: "False",
        operator: operatorEnum.exact,
      },
      {
        field_name: "is_waiting_for_activation",
        value: "True",
        operator: operatorEnum.exact,
      },
    ],
    [],
  );

  const list = useUsersList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["-created_at"],
    q: tableState.q,
    expand: ["course_join_requests.course"],
    filterParams,
  });

  const refetch = () => {
    list.refetch();
    void queryClient.refetchQueries({
      queryKey: ["users"],
    });
  };

  const activateMutation = useMutation({
    mutationKey: ["activateStudent"],
    mutationFn: (userId: string) =>
      makeGetRequest(`activate-account/${userId}`),
    onSuccess: () => {
      refetch();
      toast.add({
        title: "Student approved",
        description: "Account activated. Course join requests were processed.",
      });
    },
  });
  const declineMutation = useMutation({
    mutationKey: ["declineStudent"],
    mutationFn: (userId: string) => deleteEntity("users", userId),
    onSuccess: () => {
      refetch();
      toast.add({
        title: "Registration declined",
        description: "The pending account was removed.",
      });
    },
  });

  const isBusy = activateMutation.isPending || declineMutation.isPending;
  const columns = useMemo(
    () =>
      createStudentRegistrationColumns({
        isBusy,
        onApprove: (id) => activateMutation.mutate(String(id)),
        onDecline: (id) => declineMutation.mutate(String(id)),
      }),
    [isBusy, activateMutation, declineMutation],
  );

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">
          Student registration
        </h1>
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
        columns={columns}
        getRowId={(row) => String(row.id)}
      />
    </PageContainer>
  );
};

export default StudentRegistrationPage;
