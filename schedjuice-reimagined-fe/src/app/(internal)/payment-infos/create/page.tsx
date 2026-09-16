"use client";

import type { AutoFormGroup } from "@/components/auto-form";
import { getDefaultValues, zodResolverForAutoForm } from "@/components/auto-form";
import { PageContainer } from "@/components/layout/page-container";
import { buildPaymentInfoFieldConfig } from "@/components/finances/payment-info-form-fields";
import BackButton from "@/components/misc/back-button";
import GenericForm from "@/components/form/generic-form";
import { TypographyH1 } from "@/components/typography/h1";
import { useAutoDefaultPaymentInfo } from "@/hooks/use-auto-default-payment-info";
import { useRequireConfigurePaymentInfo } from "@/hooks/use-require-configure-payment-info";
import { paymentInfoCreateEditSchema } from "@/types/finance";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import * as z from "zod";

const PAYMENT_INFO_CREATE_GROUPS: AutoFormGroup[] = [
  {
    id: "staff",
    title: "Staff member",
    description: "Who will receive payouts through this account.",
    fields: ["user"],
  },
  {
    id: "account",
    title: "Account details",
    description: "Bank or wallet details for payouts.",
    fields: ["account_name", "bank_type", "description", "is_default"],
  },
];

const PaymentInfoCreatePage: React.FC = () => {
  const { allowed, isLoading: authLoading } = useRequireConfigurePaymentInfo();
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("user_id");
  const preselectedUserId = userIdParam ? Number(userIdParam) : 0;
  const backHref = preselectedUserId
    ? `/users/${preselectedUserId}`
    : "/payment-infos";
  const redirectUrl = preselectedUserId
    ? `/users/${preselectedUserId}`
    : "/payment-infos";

  const defaultValues = useMemo(
    () => ({
      ...getDefaultValues(paymentInfoCreateEditSchema),
      ...(preselectedUserId > 0 ? { user: preselectedUserId } : {}),
    }),
    [preselectedUserId],
  );

  const form = useForm<z.infer<typeof paymentInfoCreateEditSchema>>({
    resolver: zodResolverForAutoForm(paymentInfoCreateEditSchema),
    defaultValues,
  });

  const selectedUserId = useWatch({ control: form.control, name: "user" });
  const effectiveUserId =
    selectedUserId ??
    (preselectedUserId > 0 ? preselectedUserId : undefined);
  useAutoDefaultPaymentInfo(form, effectiveUserId);

  const fieldConfig = useMemo(
    () =>
      buildPaymentInfoFieldConfig({
        staffUserId: preselectedUserId > 0 ? preselectedUserId : undefined,
        lockStaff: preselectedUserId > 0,
      }),
    [preselectedUserId],
  );

  if (authLoading || !allowed) {
    return null;
  }

  return (
    <PageContainer width="narrow" className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <BackButton href={backHref} />
      <div className="space-y-1">
        <TypographyH1>Add Payment Info</TypographyH1>
        <p className="text-sm text-text-secondary">
          Save bank or mobile wallet details for teacher and staff payouts.
        </p>
      </div>
      <GenericForm
        formInstance={form}
        schema={paymentInfoCreateEditSchema}
        entityName="payment-info"
        apiUrl="payment-infos"
        redirectUrl={redirectUrl}
        fieldConfig={fieldConfig}
        groups={PAYMENT_INFO_CREATE_GROUPS}
      />
    </PageContainer>
  );
};

export default PaymentInfoCreatePage;
