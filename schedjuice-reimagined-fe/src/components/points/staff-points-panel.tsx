"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { fetchUserPoints } from "@/lib/points-api";
import { AdjustPointsDialog } from "./adjust-points-dialog";
import { BalanceChips } from "./balance-chips";
import { TransactionList } from "./transaction-list";

export function StaffPointsPanel({
  userId,
  userName,
}: {
  userId: number;
  userName?: string;
}) {
  const { can } = usePermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["user-points", userId],
    queryFn: () => fetchUserPoints(userId),
  });

  if (isLoading) {
    return <p className="text-sm text-text-muted">Loading points…</p>;
  }

  if (!data) {
    return (
      <p className="text-sm text-text-muted">Could not load points.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Points</h3>
        {can("points.award") && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            Adjust points
          </Button>
        )}
      </div>
      <BalanceChips pointTypes={data.point_types} balances={data.balances} />
      <TransactionList transactions={data.transactions} />
      <AdjustPointsDialog
        userId={userId}
        userName={userName}
        pointTypes={data.point_types}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdjusted={() => refetch()}
      />
    </div>
  );
}
