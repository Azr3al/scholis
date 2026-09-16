"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { useUser } from "@/hooks/useUser";
import { pickBannerUserDvr, pendingUserDvrsQueryKey, type BannerUserDvr } from "@/helpers/dvr";
import { operatorEnum } from "@/types/api";
import { bannerStickyClassName } from "@/lib/ui/overlay-classnames";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/primitives";

export function DvrPendingBannerView(props: {
  dvrId: number;
  expiresOn: string;
  name?: string;
}) {
  return (
    <div
      className={cn(
        bannerStickyClassName,
        "border-b border-amber-600/50 bg-amber-100 px-4 py-3 text-amber-950 dark:bg-amber-950/50 dark:text-amber-50",
      )}
    >
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          Please verify your profile data
          {props.name ? ` (${props.name})` : ""} — due {props.expiresOn}
        </p>
        <Link
          href={`/data-verification-requests/${props.dvrId}/verify`}
          className={cn(buttonVariants({ size: "sm", variant: "primary" }))}
        >
          Verify
        </Link>
      </div>
    </div>
  );
}

export function DvrPendingBanner() {
  const { user } = useUser();
  const { data } = useQuery({
    queryKey: pendingUserDvrsQueryKey(user?.id),
    enabled: !!user?.id,
    queryFn: () =>
      searchEntities(
        "user-data-verification-requests",
        { expand: ["data_verification_request"] },
        {
          filter_params: [
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: String(user!.id),
            },
            {
              field_name: "status",
              operator: operatorEnum.exact,
              value: "pending",
            },
          ],
        },
      ),
  });

  const rows = (data?.data?.data ?? []) as BannerUserDvr[];
  const picked = pickBannerUserDvr(rows);
  if (!picked?.data_verification_request?.id) return null;

  return (
    <DvrPendingBannerView
      dvrId={picked.data_verification_request.id}
      expiresOn={picked.data_verification_request.expires_on ?? ""}
      name={picked.data_verification_request.name}
    />
  );
}
