"use client";
import { Separator, Skeleton, buttonVariants } from "@/components/primitives";
import {
  adminCrudDetailSectionClassName,
  adminCrudStatusBadgeClassName,
  adminCrudSurfaceBodyClassName,
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";
import { cn } from "@/lib/utils";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import AuditDisplay from "@/components/misc/audit-display";
import BackButton from "@/components/misc/back-button";
import { TypographyH1 } from "@/components/typography/h1";
import { hasAdminCredentials } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const PaymentPlanDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { tenant } = useTenant();
  const showLegacyDiscountFields = Boolean(tenant?.is_legacy_discount_visible);
  const { data, isLoading } = useQuery({
    queryKey: ["getPaymentPlan", id],
    queryFn: () => fetchEntity("payment-plans", id),
  });

  return  (
<PageContainer width="default" className="space-y-3">
      <div className="flex justify-between items-center">
        <Link
          href={"/payment-plans"}
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>
        {user && hasAdminCredentials(user) && (
          <Link
            href={`/payment-plans/${id}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          >
            Edit
          </Link>
        )}
      </div>
      <div className={adminCrudSurfaceClassName()}>
        <div className={adminCrudSurfaceHeaderClassName()}>
          <h2 className="font-semibold text-text-primary">
            {isLoading ? (
              <Skeleton className="h-8 w-64" />
            ) : (
              data?.data.data.name
            )}
          </h2>
        </div>
        <div className={adminCrudSurfaceBodyClassName()}>
          {isLoading ? (
            <Skeleton className="h-36 w-full"></Skeleton>
          ) : (
            <div className="space-y-2">
                <AuditDisplay
                isLoading={isLoading}
                created_at={data?.data.data.created_at}
                updated_at={data?.data.data.updated_at}
                ></AuditDisplay>
                <Separator></Separator>
              <p>
                <span className="font-bold">Price:</span>{" "}
                {data?.data.data.price}
              </p>
              {showLegacyDiscountFields ? (
                <p>
                  <span className="font-bold">Discount Price:</span>{" "}
                  {data?.data.data.discount_price}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
);
};

export default PaymentPlanDetailsPage;
