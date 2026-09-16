"use client";
import { cn } from "@/lib/utils";
import {
  adminCrudDetailSectionClassName,
  adminCrudStatusBadgeClassName,
  adminCrudSurfaceBodyClassName,
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";
import { Skeleton, buttonVariants } from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import { hasAdminCredentials } from "@/helpers/authorization";
import { useRequireConfigurePaymentInfo } from "@/hooks/use-require-configure-payment-info";
import { useUser } from "@/hooks/useUser";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const PaymentInfoDetailsPage: React.FC = () => {
  const { allowed, isLoading: authLoading } = useRequireConfigurePaymentInfo();
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { data, isLoading } = useQuery({
    queryKey: ["getPaymentInfo", id],
    queryFn: () => fetchEntity("payment-infos", id, ["user"]),
    enabled: allowed,
  });

  const info = data?.data?.data;

  if (authLoading || !allowed) {
    return null;
  }

  return  (
<PageContainer width="default" className="space-y-3">
      <div className="flex items-center justify-between">
        <Link
          href="/payment-infos"
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>
        {user && hasAdminCredentials(user) && (
          <Link
            href={`/payment-infos/${id}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          >
            Edit
          </Link>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className={adminCrudSurfaceClassName()}>
          <div className={adminCrudSurfaceHeaderClassName()}>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-text-primary">{info?.user?.name ?? "Payment info"}</h2>
              {info?.is_default && <span className={cn(adminCrudStatusBadgeClassName("secondary"))}>Default</span>}
            </div>
            <div className="text-sm text-text-muted">
              {[info?.account_name, info?.bank_type].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className={adminCrudSurfaceBodyClassName()}>
            <p className="text-sm text-text-secondary">
              {info?.description || "No account details provided."}
            </p>
          </div>
        </div>
      )}
    </PageContainer>
);
};

export default PaymentInfoDetailsPage;
