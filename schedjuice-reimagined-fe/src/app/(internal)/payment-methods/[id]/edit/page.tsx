"use client";

import { PageContainer } from "@/components/layout/page-container";
import DeleteZone from "@/components/form/delete-zone";
import GenericForm from "@/components/form/generic-form";
import type { AutoFormGroup } from "@/components/auto-form";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { paymentMethodCreateEditSchema } from "@/types/finance";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const paymentMethodEditGroups: AutoFormGroup[] = [
  {
    id: "method",
    title: "Payment method",
    fields: ["name", "bank_account_number", "description"],
  },
  {
    id: "bank",
    title: "Bank",
    description: "Bank routing for payments — save explicitly.",
    fields: ["payment_bank"],
  },
];

const PaymentMethodEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <PageContainer width="narrow" className="space-y-3">
      <Link
        href={`/payment-methods/${id}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm"  }),
          "size-9 p-0",
        )}
        aria-label="Back"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
      </Link>
      <GenericForm
        isEdit
        autosave
        entityId={id}
        entityName="payment-method"
        apiUrl="payment-methods"
        schema={paymentMethodCreateEditSchema}
        groups={paymentMethodEditGroups}
        fieldConfig={{
          payment_bank: {
            autosave: false,
            inputProps: {
              required: true,
            },
          },
        }}
        shouldAutosaveField={(name) => name !== "payment_bank"}
        explicitSaveFields={["payment_bank"]}
        explicitSaveLabel="Save bank"
      />
      <DeleteZone
        validateInputKey="name"
        entityName={"payment-method"}
        entityId={id}
        deleteApiUrl="payment-methods"
      ></DeleteZone>
    </PageContainer>
  );
};

export default PaymentMethodEditPage;
