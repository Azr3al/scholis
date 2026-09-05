"use client";

import { PageContainer } from "@/components/layout/page-container";
import DeleteZone from "@/components/form/delete-zone";
import GenericForm from "@/components/form/generic-form";
import type { AutoFormGroup } from "@/components/auto-form";
import { buttonVariants } from "@/components/primitives";
import { categoryCreateUpdateSchema } from "@/types/course";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

const CategoryEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useTenant();
  const isMsEnabled = Boolean(
    tenant?.is_microsoft_on && tenant?.is_teams_creation_enabled,
  );

  const groups = useMemo((): AutoFormGroup[] => {
    const base: AutoFormGroup[] = [
      {
        id: "details",
        title: "Category",
        fields: ["name", "description"],
      },
    ];
    if (isMsEnabled) {
      base.push({
        id: "eligibility",
        title: "Payment eligibility",
        description: "Affects finance assignment — save explicitly.",
        fields: ["is_payment_assignment_eligible"],
      });
    }
    return base;
  }, [isMsEnabled]);

  return (
    <PageContainer width="narrow" className="space-y-3">
      <Link
        href={`/categories/${id}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm"  }),
          "size-9 p-0",
        )}
        aria-label="Back to category"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
      </Link>
      <GenericForm
        isEdit
        autosave
        entityId={id}
        entityName="category"
        apiUrl="categories"
        schema={categoryCreateUpdateSchema}
        groups={groups}
        fieldConfig={
          isMsEnabled
            ? { is_payment_assignment_eligible: { autosave: false } }
            : undefined
        }
        shouldAutosaveField={
          isMsEnabled
            ? (name) => name !== "is_payment_assignment_eligible"
            : undefined
        }
        explicitSaveFields={
          isMsEnabled ? ["is_payment_assignment_eligible"] : undefined
        }
        explicitSaveLabel={isMsEnabled ? "Save eligibility" : undefined}
      />
      <DeleteZone
        validateInputKey="name"
        entityName={"category"}
        entityId={id}
        deleteApiUrl="categories"
      ></DeleteZone>
    </PageContainer>
  );
};

export default CategoryEditPage;
