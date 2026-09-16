"use client";
import { Skeleton } from "@/components/primitives";

import { CompletionGroupForm } from "@/components/custom-fields/completion/completion-group-form";
import { useFormConfig } from "@/hooks/use-form-config";
import {
  profileCompletenessKey,
  useProfileCompleteness,
} from "@/hooks/use-profile-completeness";
import {
  filterConfigToKeys,
  missingKeysForAudience,
} from "@/lib/custom-fields/completion";
import type { FormActor } from "@/lib/custom-fields/field-policy";
import type { CompletionAudience } from "@/types/completion";
import { CUSTOM_FIELD_ENTITY_USER } from "@/types/custom-fields";
import { useQueryClient } from "@tanstack/react-query";
import { USER_HUB_TAB_COUNTS_QUERY_KEY } from "@/hooks/user-hub/use-hub-user-tab-counts";
import { useMemo } from "react";

export function CompletionForm({
  userId,
  roles,
  audience,
}: {
  userId: number;
  roles: string[];
  audience: CompletionAudience;
}) {
  const qc = useQueryClient();
  const completeness = useProfileCompleteness(userId);
  const { data: config, isLoading: configLoading } = useFormConfig(
    "edit",
    roles,
    CUSTOM_FIELD_ENTITY_USER,
  );

  const actor: FormActor = audience === "admin" ? "admin" : "user";

  const filtered = useMemo(() => {
    if (!config || !completeness.data) return null;
    const keys = missingKeysForAudience(completeness.data.missing, audience);
    return filterConfigToKeys(config, keys);
  }, [config, completeness.data, audience]);

  const onSaved = () => {
    void qc.invalidateQueries({ queryKey: profileCompletenessKey(userId) });
    void qc.invalidateQueries({ queryKey: [`getUser${userId}`] });
    void qc.invalidateQueries({ queryKey: ["user-hub-list"] });
    void qc.invalidateQueries({ queryKey: USER_HUB_TAB_COUNTS_QUERY_KEY });
  };

  if (completeness.isLoading || configLoading || !filtered) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }

  if (filtered.groups.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nothing left to fill in here. Thanks!
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {filtered.groups.map((group) => (
        <CompletionGroupForm
          key={group.id ?? group.name}
          userId={userId}
          group={group}
          actor={actor}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}
