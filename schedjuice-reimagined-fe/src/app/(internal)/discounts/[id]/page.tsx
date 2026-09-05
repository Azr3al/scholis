"use client";
import { cn } from "@/lib/utils";
import {
  adminCrudDetailSectionClassName,
  adminCrudStatusBadgeClassName,
  adminCrudSurfaceBodyClassName,
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";
import { Separator, Skeleton, buttonVariants } from "@/components/primitives";

import { fetchEntity } from "@/app/client-api/utils";
import AuditDisplay from "@/components/misc/audit-display";
import BackButton from "@/components/misc/back-button";
import { PageContainer } from "@/components/layout/page-container";
import { TypographyH1 } from "@/components/typography/h1";
import { hasAdminCredentials } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const DiscountDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { data, isLoading } = useQuery({
    queryKey: ["getDiscount", id],
    queryFn: () => fetchEntity("discounts", id),
  });
  const discount = data?.data.data;

  return (
    <PageContainer width="default" className="space-y-3">
      <div className="flex justify-between items-center">
        <Link
          href="/discounts"
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>
        {user && hasAdminCredentials(user) && (
          <Link
            href={`/discounts/${id}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          >
            Edit
          </Link>
        )}
      </div>
      <div className={adminCrudSurfaceClassName()}>
        <div className={adminCrudSurfaceHeaderClassName()}>
          <h2 className="font-semibold text-text-primary">
            {isLoading ? <Skeleton className="h-8 w-64" /> : discount?.name}
          </h2>
        </div>
        <div className={adminCrudSurfaceBodyClassName()}>
          {isLoading ? (
            <Skeleton className="h-36 w-full" />
          ) : (
            <div className="space-y-2">
              <AuditDisplay
                isLoading={isLoading}
                created_at={discount?.created_at}
                updated_at={discount?.updated_at}
              />
              <Separator />
              <p>
                <span className="font-bold">Type:</span> {discount?.discount_type}
              </p>
              {discount?.discount_type === "percent" && (
                <p>
                  <span className="font-bold">Percent:</span> {discount?.percent_value}%
                </p>
              )}
              {discount?.discount_type === "fixed_amount" && (
                <p>
                  <span className="font-bold">Fixed amount:</span> {discount?.fixed_amount}
                </p>
              )}
              <p>
                <span className="font-bold">Scope:</span> {discount?.scope}
              </p>
              <p>
                <span className="font-bold">Active:</span>{" "}
                {discount?.is_active ? "Yes" : "No"}
              </p>
              {discount?.description ? (
                <p>
                  <span className="font-bold">Description:</span> {discount.description}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export default DiscountDetailsPage;
