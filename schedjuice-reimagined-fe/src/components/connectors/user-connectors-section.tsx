"use client";

import { RecordSection } from "@/components/record/record-section";
import { isAdmin, isSuperAdmin } from "@/helpers/authorization";
import { organizationType } from "@/types/organization";
import { accountType } from "@/types/user";
import { MicrosoftConnectorRow } from "./microsoft-connector-row";
import { TelegramConnectorRow } from "./telegram-connector-row";
import { GoogleConnectorRow } from "./google-connector-row";

export function UserConnectorsSection({
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
  const canSeeMicrosoft =
    Boolean(tenant?.is_microsoft_on) &&
    (isSuperAdmin(viewerAccount) || isAdmin(viewerAccount));
  const canSeeTelegram = Boolean(tenant?.is_telegram_on);
  const canSeeGoogle = Boolean(tenant?.is_google_on);

  if (!canSeeMicrosoft && !canSeeTelegram && !canSeeGoogle) return null;

  return (
    <RecordSection
      title="Connectors"
      description="External accounts linked to this user for integrations and notifications."
    >
      <div className="flex flex-col gap-4 [&>div]:animate-in [&>div]:fade-in-0 [&>div]:slide-in-from-bottom-1 [&>div]:duration-300">
        {canSeeMicrosoft ? (
          <MicrosoftConnectorRow
            user={user}
            viewerAccount={viewerAccount}
            tenant={tenant}
            onUpdated={onUpdated}
          />
        ) : null}
        {canSeeTelegram ? (
          <TelegramConnectorRow
            user={user}
            viewerAccount={viewerAccount}
            tenant={tenant}
            onUpdated={onUpdated}
          />
        ) : null}
        {canSeeGoogle ? (
          <GoogleConnectorRow
            user={user}
            viewerAccount={viewerAccount}
            tenant={tenant}
            onUpdated={onUpdated}
          />
        ) : null}
      </div>
    </RecordSection>
  );
}
