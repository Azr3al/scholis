"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import { buildPaymentInfoFieldConfig } from "@/components/finances/payment-info-form-fields";
import DeleteZone from "@/components/form/delete-zone";
import BackButton from "@/components/misc/back-button";
import AutoForm, {
  AutoFormSkeleton,
  getDefaultValues,
  getObjectFormSchema,
  type AutoFormGroup,
} from "@/components/auto-form";
import { Button } from "@/components/primitives";
import { TypographyH1 } from "@/components/typography/h1";
import { useToast } from "@/components/primitives";
import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
import {
  canConfigurePaymentInfo,
  canManagePaymentInfoForUser,
  isProfileScopedPaymentInfoRoutes,
} from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import {
  paymentInfoCreateEditSchema,
  paymentInfoType,
} from "@/types/finance";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const HIGH_RISK_PAYMENT_INFO_FIELDS = [
  "user",
  "bank_type",
  "is_default",
] as const;

const selfServiceEditGroups: AutoFormGroup[] = [
  {
    id: "account",
    title: "Account details",
    fields: ["account_name", "bank_type", "description"],
  },
  {
    id: "routing",
    title: "Default payout",
    description: "Default payout account.",
    fields: ["is_default"],
  },
];

const UserPaymentInfoEditPage: React.FC = () => {
  const router = useRouter();
  const params = useParams<{ id: string; paymentInfoId: string }>();
  const subjectUserId = Number(params.id);
  const paymentInfoId = params.paymentInfoId;
  const { user: viewer } = useUser();
  const toast = useToast();
  const profileScoped = Boolean(
    viewer && isProfileScopedPaymentInfoRoutes(viewer, subjectUserId),
  );
  const allowed =
    viewer != null &&
    Number.isFinite(subjectUserId) &&
    canManagePaymentInfoForUser(viewer, subjectUserId) &&
    profileScoped;

  const { refetch, data, isLoading, isFetching } = useQuery({
    queryKey: ["getPaymentInfo", paymentInfoId],
    queryFn: () => fetchEntity("payment-infos", paymentInfoId, ["user"]),
    onSuccess: (res) => {
      Object.keys(res.data.data).forEach((k) => {
        form.setValue(k, res.data.data[k]);
      });
    },
    enabled: allowed,
  });

  const objectFormSchema = getObjectFormSchema(paymentInfoCreateEditSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(paymentInfoCreateEditSchema),
    defaultValues: getDefaultValues(objectFormSchema),
  });

  const updatePaymentInfo = useMutation({
    mutationKey: ["updatePaymentInfo", paymentInfoId],
    mutationFn: (payload: Partial<paymentInfoType>) =>
      updateEntity("payment-infos", paymentInfoId, payload),
    onSuccess: () => {
      toast.add({ title: "Payout account updated" });
    },
    onError: (e) => {
      setFormErrrors(e, form);
      scheduleScrollToFirstFormError(form);
    },
  });

  useEffect(() => {
    if (viewer == null) return;
    if (!allowed) {
      router.replace(
        viewer.id === subjectUserId ? "/profile" : `/users/${subjectUserId}`,
      );
    }
  }, [allowed, router, subjectUserId, viewer]);

  useEffect(() => {
    if (!allowed) return;
    refetch();
  }, [allowed, refetch]);

  const rowUserId =
    typeof data?.data?.data?.user === "object"
      ? data?.data?.data?.user?.id
      : data?.data?.data?.user;

  useEffect(() => {
    if (viewer == null || rowUserId == null || isLoading || isFetching) return;
    const ownsRow = Number(rowUserId) === viewer.id;
    const canAdmin = canConfigurePaymentInfo(viewer);
    if (!ownsRow && !canAdmin) {
      router.replace(`/users/${subjectUserId}`);
    }
  }, [viewer, rowUserId, isLoading, isFetching, router, subjectUserId]);

  const fieldConfig = useMemo(() => {
    const base = buildPaymentInfoFieldConfig({
      staffUserId: subjectUserId,
      lockStaff: true,
    });
    return {
      ...base,
      user: { ...base.user, autosave: false },
      bank_type: { ...base.bank_type, autosave: false },
      is_default: { ...base.is_default, autosave: false },
    };
  }, [subjectUserId]);

  const handleAutosave = useCallback(
    async (diff: Record<string, unknown>) => {
      try {
        return await updateEntity("payment-infos", paymentInfoId, diff);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        throw e;
      }
    },
    [form, paymentInfoId],
  );

  const saveHighRisk = useCallback(() => {
    const values = form.getValues();
    const payload: Record<string, unknown> = {};
    for (const key of HIGH_RISK_PAYMENT_INFO_FIELDS) {
      if (key === "user") continue;
      payload[key] = values[key];
    }
    updatePaymentInfo.mutate(payload as Partial<paymentInfoType>);
  }, [form, updatePaymentInfo]);

  if (!allowed) {
    return null;
  }

  return (
    <PageContainer width="narrow" className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <BackButton href={`/users/${subjectUserId}`} />
      <div className="space-y-1">
        <TypographyH1>Edit payout account</TypographyH1>
        <p className="text-sm text-text-secondary">
          Update where you receive salary payouts.
        </p>
      </div>
      <section className="space-y-4 border-b border-border pb-6">
        {isLoading || isFetching ? (
          <AutoFormSkeleton groups={selfServiceEditGroups} saveMode="edit" />
        ) : (
          <AutoForm
            form={form}
            schema={paymentInfoCreateEditSchema}
            saveMode="edit"
            groups={selfServiceEditGroups}
            fieldConfig={fieldConfig}
            onAutosave={handleAutosave}
            autosaveQueryKey={["getPaymentInfo", paymentInfoId]}
            shouldAutosaveField={(name) =>
              !(HIGH_RISK_PAYMENT_INFO_FIELDS as readonly string[]).includes(
                name,
              )
            }
          >
            <div className="mt-6 flex min-h-10 items-center gap-3">
              <Button
                type="button"
                onClick={saveHighRisk}
                isLoading={updatePaymentInfo.isLoading}
              >
                Save bank and default
              </Button>
            </div>
          </AutoForm>
        )}
      </section>
      <DeleteZone
        validateInputKey="account_name"
        entityName="payment-info"
        entityId={paymentInfoId}
        deleteApiUrl="payment-infos"
        redirectUrl={`/users/${subjectUserId}`}
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

export default UserPaymentInfoEditPage;
