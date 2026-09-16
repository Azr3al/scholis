"use client";

import { AiLimitsForm } from "@/components/users/ai/ai-limits-form";
import { AiMemoryForm } from "@/components/users/ai/ai-memory-form";
import { AiUsagePanel } from "@/components/users/ai/ai-usage-panel";
import {
  canManageAiLimits,
  canManageAiMemory,
  canViewAiLimits,
  canViewAiMemory,
  canViewAiUsage,
} from "@/lib/ai/visibility";
import type { accountType } from "@/types/user";

export function RecordAi({
  subject,
  viewer,
  userId,
}: {
  subject: accountType;
  viewer: accountType;
  userId: number;
}) {
  const showUsage = canViewAiUsage({ subject, viewer });
  const showMemory = canViewAiMemory({ subject, viewer });
  const showLimits = canViewAiLimits({ subject, viewer });
  const canEditMemory = canManageAiMemory({ subject, viewer });
  const canEditLimits = canManageAiLimits({ subject, viewer });

  return (
    <div className="sj-root flex flex-col gap-8 [overflow-anchor:none]">
      {showUsage ? <AiUsagePanel userId={userId} /> : null}
      {showLimits ? (
        <AiLimitsForm userId={userId} readOnly={!canEditLimits} />
      ) : null}
      {showMemory ? (
        <AiMemoryForm
          userId={userId}
          readOnly={!canEditMemory}
          profileName={subject.name ?? undefined}
        />
      ) : null}
    </div>
  );
}
