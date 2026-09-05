"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity, updateEntity } from "@/app/client-api/utils";
import { buildPaymentInfoFieldConfig } from "@/components/finances/payment-info-form-fields";
import DeleteZone from "@/components/form/delete-zone";
import AdaptiveBackButton from "@/components/nav/adaptive-back-button";
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
import { useRequireConfigurePaymentInfo } from "@/hooks/use-require-configure-payment-info";
import {
  paymentInfoCreateEditSchema,
  paymentInfoType,
} from "@/types/finance";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const HIGH_RISK_PAYMENT_INFO_FIELDS = [
  "user",
  "bank_type",
  "is_default",
] as const;

const paymentInfoEditGroups: AutoFormGroup[] = [
  {
    id: "staff",
    title: "Staff member",
    description: "Who receives payouts — save explicitly.",
    fields: ["user"],
  },
  {
    id: "account",
    title: "Account details",
    fields: ["account_name", "bank_type", "description"],
  },
  {
    id: "routing",
    title: "Default payout",
    description: "Default flag — save explicitly.",
    fields: ["is_default"],
  },
];

const PaymentInfoEditPage: React.FC = () => {
  const { allowed, isLoading: authLoading } = useRequireConfigurePaymentInfo();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const objectFormSchema = getObjectFormSchema(paymentInfoCreateEditSchema);
  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(paymentInfoCreateEditSchema),
    defaultValues: getDefaultValues(objectFormSchema),
  });
  const { refetch, data, isLoading, isFetching } = useQuery({
    queryKey: ["getPaymentInfo", id],
    queryFn: () => fetchEntity("payment-infos", id, ["user"]),
    onSuccess: (res) => {
      Object.keys(res.data.data).forEach((k) => {
        form.setValue(k, res.data.data[k]);
      });
    },
    enabled: allowed,
  });

  const updatePaymentInfo = useMutation({
    mutationKey: ["updatePaymentInfo", id],
    mutationFn: (payload: Partial<paymentInfoType>) =>
      updateEntity("payment-infos", id, payload),
    onSuccess: () => {
      toast.add({ title: "Payment info updated" });
    },
    onError: (e) => {
      setFormErrrors(e, form);
      scheduleScrollToFirstFormError(form);
    },
  });

  useEffect(() => {
    if (!allowed) return;
    refetch();
  }, [allowed, refetch]);

  const userId =
    typeof data?.data?.data?.user === "object"
      ? data?.data?.data?.user?.id
      : data?.data?.data?.user;

  const fieldConfig = useMemo(() => {
    const base = buildPaymentInfoFieldConfig({
      staffUserId: userId,
    });
    return {
      ...base,
      user: { ...base.user, autosave: false },
      bank_type: { ...base.bank_type, autosave: false },
      is_default: { ...base.is_default, autosave: false },
    };
  }, [userId]);

  const handleAutosave = useCallback(
    async (diff: Record<string, unknown>) => {
      try {
        return await updateEntity("payment-infos", id, diff);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        throw e;
      }
    },
    [form, id],
  );

  const saveHighRisk = useCallback(() => {
    const values = form.getValues();
    const payload: Record<string, unknown> = {};
    for (const key of HIGH_RISK_PAYMENT_INFO_FIELDS) {
      payload[key] = values[key];
    }
    updatePaymentInfo.mutate(payload as Partial<paymentInfoType>);
  }, [form, updatePaymentInfo]);

  if (authLoading || !allowed) {
    return null;
  }

  return (
    <PageContainer width="narrow" className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <AdaptiveBackButton to={`/payment-infos/${id}`} />
      <div className="space-y-1">
        <TypographyH1>Edit Payment Info</TypographyH1>
        <p className="text-sm text-text-secondary">
          Update payout details for this staff member.
        </p>
      </div>
      <section className="space-y-4 border-b border-border pb-6">
        <div className="space-y-1">
          <h2 className="font-serif text-xl text-text-primary">
            Payment details
          </h2>
          <p className="text-sm text-text-secondary">
            Changes apply immediately for future payroll and finance workflows.
          </p>
        </div>
        {isLoading || isFetching ? (
          <AutoFormSkeleton groups={paymentInfoEditGroups} saveMode="edit" />
        ) : (
          <AutoForm
            form={form}
            schema={paymentInfoCreateEditSchema}
            saveMode="edit"
            groups={paymentInfoEditGroups}
            fieldConfig={fieldConfig}
            onAutosave={handleAutosave}
            autosaveQueryKey={["getPaymentInfo", id]}
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
        entityId={id}
        deleteApiUrl="payment-infos"
      />
    </PageContainer>
  );
};

export default PaymentInfoEditPage;
