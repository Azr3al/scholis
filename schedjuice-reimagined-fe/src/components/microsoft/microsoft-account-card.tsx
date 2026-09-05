"use client";

import { isAdmin, isSuperAdmin } from "@/helpers/authorization";
import { organizationType } from "@/types/organization";
import { accountType } from "@/types/user";
import { MicrosoftConnectorRow } from "@/components/connectors/microsoft-connector-row";
import { MicrosoftStatusChip } from "./microsoft-status-chip";

/**
 * Legacy card wrapper — prefer `UserConnectorsSection` on user edit pages.
 * Visible only to superadmin/admin on Microsoft-enabled tenants.
 */
export function MicrosoftAccountCard({
  user,
  viewerAccount,
  tenant,
  onUpdated,
}: {
  user: accountType;
  viewerAccount: accountType;
  tenant: organizationType | null;
  onUpdated?: () => void;
}) {
  const canManage = isSuperAdmin(viewerAccount) || isAdmin(viewerAccount);
  if (!tenant?.is_microsoft_on || !canManage) return null;

  const status =
    user.microsoft_status ?? (user.microsoft_id ? "linked" : "not_created");

  return (
    <div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3>Microsoft account</h3>
          <MicrosoftStatusChip status={status} />
        </div>
        <p>
          Manage Microsoft account provisioning for this user.
        </p>
      </div>
      <div className="p-0 px-6 pb-6">
        <MicrosoftConnectorRow
          user={user}
          viewerAccount={viewerAccount}
          tenant={tenant}
          onUpdated={onUpdated}
        />
      </div>
    </div>
  );
}
