"use client";
import { useMemo } from "react";
import { InlineBuiltinGroup } from "@/components/record/inline/inline-builtin-group";
import { UserPaymentInfoTab } from "@/components/users/profile/user-payment-info-tab";
import { canEditUser } from "@/helpers/authorization";
import { OPERATIONAL_SECTIONS } from "@/lib/custom-fields/build-form-sections";
import { getUserSchema, type accountType } from "@/types/user";
import type { organizationType } from "@/types/organization";

export function RecordFinance({
  subject,
  viewer,
  tenant,
  userId,
  recordQueryKey,
  showPaymentInfoTab,
  canManagePaymentInfo,
}: {
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  userId: string;
  recordQueryKey: unknown[];
  showPaymentInfoTab: boolean;
  canManagePaymentInfo: boolean;
}) {
  const canEdit = canEditUser(viewer, subject.id);

  const availableKeys = useMemo(() => {
    const base = getUserSchema(viewer, tenant ?? undefined);
    return new Set(Object.keys(base.shape));
  }, [viewer, tenant]);

  const payrollSection = OPERATIONAL_SECTIONS.find((op) => op.id === "payroll");
  const payrollKeys =
    payrollSection?.keys.filter((k) => availableKeys.has(k)) ?? [];
  const showPayroll = payrollKeys.length > 0;

  if (!showPayroll && !showPaymentInfoTab) {
    return (
      <p className="sj-root py-10 text-center text-sm text-text-muted">
        No finance details available for this person.
      </p>
    );
  }

  return (
    <div className="sj-root flex flex-col gap-8">
      {showPayroll ? (
        <InlineBuiltinGroup
          sectionId="payroll"
          keys={payrollKeys}
          subject={subject}
          viewer={viewer}
          tenant={tenant}
          recordQueryKey={recordQueryKey}
          canEdit={canEdit}
        />
      ) : null}
      {showPaymentInfoTab ? (
        <UserPaymentInfoTab userId={userId} canManage={canManagePaymentInfo} />
      ) : null}
    </div>
  );
}
