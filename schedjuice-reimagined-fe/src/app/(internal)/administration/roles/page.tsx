"use client";

import { PageContainer } from "@/components/layout/page-container";
import { MatrixGrid } from "@/components/rbac/matrix-grid";
import { PolicyOverview } from "@/components/rbac/policy-overview";
import { RoleAssignTab } from "@/components/rbac/role-assign-tab";
import { ViewAsDialog } from "@/components/rbac/view-as-dialog";
import { TypographyH1 } from "@/components/typography/h1";
import { Tabs } from "@/components/primitives";
import { useCatalog, useRoles } from "@/api/rbac";
import { isSuperAdmin } from "@/helpers/authorization";
import { usePermissions } from "@/hooks/usePermissions";
import { useUser } from "@/hooks/useUser";

export default function RolesAdministrationPage() {
  const { data: catalog = [], isLoading: catalogLoading } = useCatalog();
  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const { user } = useUser(false);
  const { can } = usePermissions();
  const showViewAs = Boolean(user && isSuperAdmin(user));
  const showAssignTab = can("user.assign_roles") || can("rbac.manage");

  return (
    <PageContainer width="wide" className="flex flex-col gap-6 print:border-0">
      <div className="flex flex-col gap-1 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <TypographyH1>Roles &amp; Permissions</TypographyH1>
            <p className="text-sm text-text-secondary">
              Edit the permission matrix, assign roles to staff in bulk, or
              review a human-readable policy summary for each role.
            </p>
          </div>
          {showViewAs ? <ViewAsDialog /> : null}
        </div>
      </div>

      <Tabs.Root defaultValue="editor" className="print:hidden">
        <Tabs.List>
          <Tabs.Tab value="editor">Editor</Tabs.Tab>
          {showAssignTab ? <Tabs.Tab value="assign">Assign</Tabs.Tab> : null}
          <Tabs.Tab value="policy">Policy Overview</Tabs.Tab>
          <Tabs.Indicator />
        </Tabs.List>

        <Tabs.Panel value="editor" className="flex flex-col gap-4">
          <MatrixGrid
            catalog={catalog}
            roles={roles}
            isLoading={catalogLoading || rolesLoading}
          />
        </Tabs.Panel>

        {showAssignTab ? (
          <Tabs.Panel value="assign">
            <RoleAssignTab roles={roles} isLoading={rolesLoading} />
          </Tabs.Panel>
        ) : null}

        <Tabs.Panel value="policy">
          <PolicyOverview />
        </Tabs.Panel>
      </Tabs.Root>

      <div className="hidden print:block">
        <PolicyOverview />
      </div>
    </PageContainer>
  );
}
