"use client";

import type { AutoFormGroup } from "@/components/auto-form";
import { getDefaultValues, zodResolverForAutoForm } from "@/components/auto-form";
import { PageContainer } from "@/components/layout/page-container";
import { buildPaymentInfoFieldConfig } from "@/components/finances/payment-info-form-fields";
import BackButton from "@/components/misc/back-button";
import GenericForm from "@/components/form/generic-form";
import { TypographyH1 } from "@/components/typography/h1";
import {
  canManagePaymentInfoForUser,
  isProfileScopedPaymentInfoRoutes,
} from "@/helpers/authorization";
import { useAutoDefaultPaymentInfo } from "@/hooks/use-auto-default-payment-info";
import { useUser } from "@/hooks/useUser";
import { paymentInfoCreateEditSchema } from "@/types/finance";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const PAYMENT_INFO_CREATE_GROUPS: AutoFormGroup[] = [
  {
    id: "account",
    title: "Account details",
    description: "Bank or wallet details for your salary payouts.",
    fields: ["account_name", "bank_type", "description", "is_default"],
  },
];

const UserPaymentInfoCreatePage: React.FC = () => {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const subjectUserId = Number(params.id);
  const { user: viewer } = useUser();
  const profileScoped = Boolean(
    viewer && isProfileScopedPaymentInfoRoutes(viewer, subjectUserId),
  );
  const allowed =
    viewer != null &&
    Number.isFinite(subjectUserId) &&
    canManagePaymentInfoForUser(viewer, subjectUserId) &&
    profileScoped;

  useEffect(() => {
    if (viewer == null) return;
    if (!allowed) {
      router.replace(
        viewer.id === subjectUserId ? "/profile" : `/users/${subjectUserId}`,
      );
    }
  }, [allowed, router, subjectUserId, viewer]);

  const defaultValues = useMemo(
    () => ({
      ...getDefaultValues(paymentInfoCreateEditSchema),
      user: subjectUserId,
    }),
    [subjectUserId],
  );

  const form = useForm<z.infer<typeof paymentInfoCreateEditSchema>>({
    resolver: zodResolverForAutoForm(paymentInfoCreateEditSchema),
    defaultValues,
  });

  useAutoDefaultPaymentInfo(form, subjectUserId);

  const fieldConfig = useMemo(
    () =>
      buildPaymentInfoFieldConfig({
        staffUserId: subjectUserId,
        lockStaff: true,
      }),
    [subjectUserId],
  );

  if (!allowed) {
    return null;
  }

  return (
    <PageContainer width="narrow" className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <BackButton href={`/users/${subjectUserId}`} />
      <div className="space-y-1">
        <TypographyH1>Add payout account</TypographyH1>
        <p className="text-sm text-text-secondary">
          Where you receive salary — bank or mobile wallet details.
        </p>
      </div>
      <GenericForm
        formInstance={form}
        schema={paymentInfoCreateEditSchema}
        entityName="payment-info"
        apiUrl="payment-infos"
        redirectUrl={`/users/${subjectUserId}`}
        fieldConfig={fieldConfig}
        groups={PAYMENT_INFO_CREATE_GROUPS}
      />
      <p className="text-sm text-text-muted">
        <Link
          href={`/users/${subjectUserId}`}
          className="font-medium text-text-secondary hover:text-foreground"
        >
          Back to your profile
        </Link>
      </p>
    </PageContainer>
  );
};

export default UserPaymentInfoCreatePage;
