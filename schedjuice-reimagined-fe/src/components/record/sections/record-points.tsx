"use client";

import { StaffPointsPanel } from "@/components/points/staff-points-panel";

export function RecordPoints({
  userId,
  userName,
}: {
  userId: number;
  userName?: string;
}) {
  return (
    <div className="sj-root flex flex-col gap-8">
      <StaffPointsPanel userId={userId} userName={userName} />
    </div>
  );
}
