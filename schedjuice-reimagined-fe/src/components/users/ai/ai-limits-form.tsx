"use client";
import { Button, Input, Skeleton, useToast } from "@/components/primitives";

import {
  fetchUserAiPreferences,
  patchUserAiPreferences,
} from "@/app/client-api/ai-user-preferences";
import { limitSourceLabel } from "@/lib/ai/budget-footer";
import { formatAiUsd } from "@/types/ai-usage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function AiLimitsForm({
  userId,
  readOnly,
}: {
  userId: number;
  readOnly: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const prefsQuery = useQuery({
    queryKey: ["userAiPreferences", userId],
    queryFn: () => fetchUserAiPreferences(userId),
  });

  const [monthlyLimit, setMonthlyLimit] = useState("");

  useEffect(() => {
    if (!prefsQuery.data) return;
    setMonthlyLimit(prefsQuery.data.monthly_usd_limit ?? "");
  }, [prefsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      patchUserAiPreferences(userId, {
        monthly_usd_limit:
          monthlyLimit.trim() === "" ? null : Number(monthlyLimit),
      }),
    onSuccess: () => {
      toast.add({ description: "AI limit saved." });
      void queryClient.invalidateQueries({ queryKey: ["userAiPreferences", userId] });
      void queryClient.invalidateQueries({ queryKey: ["userAiUsage", userId] });
    },
    onError: () => {
      toast.add({
        description: "Failed to save AI limit."});
    },
  });

  if (prefsQuery.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (prefsQuery.isError || !prefsQuery.data) {
    return (
      <div className="rounded-lg border border-border bg-surface text-text-primary">
        <div className="p-6 pt-0 pt-6">
          <p className="text-sm text-destructive">Failed to load AI limits.</p>
        </div>
      </div>
    );
  }

  const effective = prefsQuery.data.effective_monthly_usd_limit;
  const limitSource = prefsQuery.data.limit_source;
  const inputsDisabled = readOnly || saveMutation.isPending;

  return (
    <div className="rounded-lg border border-border bg-surface text-text-primary [overflow-anchor:none]">
      <div className="flex flex-col gap-1.5 p-6">
        <h3 className="font-serif text-xl leading-none tracking-tight">Limits</h3>
        <p className="text-sm text-text-secondary">
          Monthly AI spend cap for this user. Blank inherits the org default.
        </p>
      </div>
      <div className="p-6 pt-0 space-y-4">
        {effective ? (
          <p className="text-sm text-text-muted">
            Effective limit: {formatAiUsd(effective)}
            {limitSource ? ` (${limitSourceLabel(limitSource)})` : null}
          </p>
        ) : null}

        {readOnly ? (
          <p className="text-sm">
            Override:{" "}
            {prefsQuery.data.monthly_usd_limit
              ? formatAiUsd(prefsQuery.data.monthly_usd_limit)
              : "Inherit org default"}
          </p>
        ) : (
          <div className="space-y-2">
            <label htmlFor="monthly-usd-limit">Monthly USD limit</label>
            <Input
              id="monthly-usd-limit"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Inherit org default"
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
              disabled={inputsDisabled}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                isLoading={saveMutation.isPending}
                disabled={inputsDisabled}
                onClick={() => saveMutation.mutate()}
              >
                Save limit
              </Button>
              {prefsQuery.data.monthly_usd_limit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    setMonthlyLimit("");
                    patchUserAiPreferences(userId, { monthly_usd_limit: null })
                      .then(() => {
                        toast.add({ description: "Reset to org default." });
                        void queryClient.invalidateQueries({
                          queryKey: ["userAiPreferences", userId],
                        });
                        void queryClient.invalidateQueries({
                          queryKey: ["userAiUsage", userId],
                        });
                      })
                      .catch(() => {
                        toast.add({
                          description: "Failed to reset limit."});
                      });
                  }}
                >
                  Reset to default
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
