"use client";
import { Skeleton, buttonVariants } from "@/components/primitives";
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
import { hasAdminCredentials } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const PaymentMethodDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { refetch, data, isLoading, isFetching } = useQuery({
    queryKey: ["getPaymentMethod", id],
    queryFn: () => fetchEntity("payment-methods", id),
  });
  const { user } = useUser();

  return  (
<PageContainer width="default" className="space-y-3">
      <div className="flex justify-between items-center">
        <Link
          href={"/payment-methods"}
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>
        {user && hasAdminCredentials(user) && (
          <Link
            href={`/payment-methods/${id}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          >
            Edit
          </Link>
        )}
      </div>
      {isLoading || isFetching ? (
        <div aria-busy="true">
          <div className={cn(adminCrudSurfaceHeaderClassName(), "space-y-2")}>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </div>
      ) : (
        <div className={adminCrudSurfaceClassName()}>
          <div className={adminCrudSurfaceHeaderClassName()}>
            <h2 className="font-semibold text-text-primary">{data?.data.data.name}</h2>
            <div className="text-sm text-text-muted">{data?.data.data.description}</div>
          </div>
        </div>
      )}
    </PageContainer>
);
};

export default PaymentMethodDetailsPage;
