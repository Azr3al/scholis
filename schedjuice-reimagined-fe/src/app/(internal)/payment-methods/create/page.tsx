"use client";

import type { AutoFormGroup } from "@/components/auto-form";
import { PageContainer } from "@/components/layout/page-container";
import { TypographyH1 } from "@/components/typography/h1";
import BackButton from "@/components/misc/back-button";
import GenericForm from "@/components/form/generic-form";
import { paymentMethodCreateEditSchema } from "@/types/finance";

const PAYMENT_METHOD_CREATE_GROUPS: AutoFormGroup[] = [
  {
    id: "method",
    title: "Method",
    description: "Display name and description for this payment method.",
    fields: ["name", "bank_account_number", "description"],
  },
  {
    id: "bank",
    title: "Bank",
    description: "Bank or wallet used for this method.",
    fields: ["payment_bank"],
  },
];

const PaymentMethodCreatePage: React.FC = () => {
  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/payment-methods"></BackButton>
      <TypographyH1>Create Payment Method</TypographyH1>
      <GenericForm
        fieldConfig={{
          payment_bank: {
            inputProps: {
              required: true,
            },
          },
        }}
        schema={paymentMethodCreateEditSchema}
        entityName="payment-method"
        apiUrl="payment-methods"
        redirectUrl="/payment-methods"
        groups={PAYMENT_METHOD_CREATE_GROUPS}
      />
    </PageContainer>
  );
};

export default PaymentMethodCreatePage;
