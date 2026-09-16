"use client";

import {
  createUserLogColumns,
  type UserLogRow,
} from "@/app/(internal)/logs/user-log-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { Select, Sheet } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { UserLogsPanel } from "@/components/user-logs/user-logs-panel";
import { usePermissions } from "@/hooks/usePermissions";
import { isStaffRoles, isStudentRoles } from "@/lib/user-logs/applies-to";
import { useUsersList } from "@/sdk/hooks/users";
import type { ResourceListResult } from "@/components/data-table/types";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type RoleFilter = "all" | "student" | "staff";

const ROLE_FILTER_ITEMS = [
  { value: "all", label: "All users" },
  { value: "student", label: "Students" },
  { value: "staff", label: "Staff" },
];

export default function LogsPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedUser, setSelectedUser] = useState<UserLogRow | null>(null);

  useEffect(() => {
    if (!can("userlog.view")) {
      router.replace("/");
    }
  }, [can, router]);

  const tableState = useResourceTableState({
    namespace: "user-logs-grid",
    syncUrl: false,
    initial: { sorts: ["name"], pageSize: 100 },
  });

  const list = useUsersList({
    page: 1,
    pageSize: -1,
    sorts: tableState.sorts.length ? tableState.sorts : ["name"],
    q: tableState.q,
    fields: ["id", "name", "email", "roles"],
  });

  const filteredList: ResourceListResult<UserLogRow> = useMemo(() => {
    const rows = (list.rows as UserLogRow[]).filter((r) => {
      if (roleFilter === "student") return isStudentRoles(r.roles ?? []);
      if (roleFilter === "staff") return isStaffRoles(r.roles ?? []);
      return true;
    });
    return {
      ...list,
      rows,
      total: rows.length,
    };
  }, [list, roleFilter]);

  const columns = useMemo(
    () =>
      createUserLogColumns({
        onViewLogs: setSelectedUser,
      }),
    [],
  );

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">User logs</h1>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer width="wide" className="space-y-4">
      <ResourceTable
        list={filteredList}
        tableState={tableState}
        columns={columns}
        getRowId={(row) => String(row.id)}
        filterSlot={
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-primary">Show</label>
            <Select
              value={roleFilter}
              onValueChange={(v) => setRoleFilter(v as RoleFilter)}
              items={ROLE_FILTER_ITEMS}
              className="w-[180px]"
            />
          </div>
        }
      />

      <Sheet.Root
        open={selectedUser != null}
        onOpenChange={(open) => {
          if (!open) setSelectedUser(null);
        }}
      >
        <Sheet.Portal>
          <Sheet.Backdrop />
          <Sheet.Popup
            side="right"
            className="w-full overflow-y-auto sm:max-w-lg"
          >
            {selectedUser && (
              <>
                <Sheet.Title>{selectedUser.name}</Sheet.Title>
                <div className="mt-4">
                  <UserLogsPanel
                    userId={selectedUser.id}
                    subjectRoles={selectedUser.roles ?? []}
                  />
                </div>
              </>
            )}
          </Sheet.Popup>
        </Sheet.Portal>
      </Sheet.Root>
    </PageContainer>
  );
}
