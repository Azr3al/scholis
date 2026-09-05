"use client";
import { Button, Input, Select, Skeleton, useToast } from "@/components/primitives";

import {
  fetchUserAiPreferences,
  patchUserAiPreferences,
} from "@/app/client-api/ai-user-preferences";
import {
  RESPONSE_LANGUAGE_OPTIONS,
  TONE_OPTIONS,
  VERBOSITY_OPTIONS,
  type AiUserPreferences,
} from "@/types/ai-user-preferences";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function AiMemoryForm({
  userId,
  readOnly,
  profileName,
}: {
  userId: number;
  readOnly: boolean;
  profileName?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const prefsQuery = useQuery({
    queryKey: ["userAiPreferences", userId],
    queryFn: () => fetchUserAiPreferences(userId),
  });

  const [form, setForm] = useState<AiUserPreferences | null>(null);

  useEffect(() => {
    if (prefsQuery.data) {
      setForm(prefsQuery.data);
    }
  }, [prefsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("No form data");
      return patchUserAiPreferences(userId, {
        response_language: form.response_language,
        tone: form.tone,
        verbosity: form.verbosity,
        preferred_name: form.preferred_name,
      });
    },
    onSuccess: (data) => {
      setForm(data);
      queryClient.setQueryData(["userAiPreferences", userId], data);
      toast.add({ description: "AI memory saved" });
    },
    onError: (err: Error) => {
      toast.add({
        description: err.message || "Failed to save"});
    },
  });

  return (
    <div className="rounded-lg border border-border bg-surface text-text-primary [overflow-anchor:none]">
      <div className="flex flex-col gap-1.5 p-6">
        <h3 className="font-serif text-xl leading-none tracking-tight">Memory</h3>
        <p className="text-sm text-text-secondary">
          Persistent preferences for the AI assistant across Telegram and web.
          {profileName && !form?.preferred_name
            ? ` Replies use your profile name (${profileName}) when preferred name is empty.`
            : null}
        </p>
      </div>
      <div className="p-6 pt-0 min-h-[360px] space-y-4">
        {prefsQuery.isLoading || !form ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
            <Skeleton className="h-9 w-24" />
          </>
        ) : (
          <>
            <fieldset
              disabled={saveMutation.isPending}
              className="min-w-0 border-0 p-0 m-0"
            >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="ai-response-language">Response language</label>
                <Select
                  value={form.response_language}
                  onValueChange={(value) =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            response_language:
                              value as AiUserPreferences["response_language"],
                          }
                        : prev,
                    )
                  }
                  disabled={readOnly}
                  items={RESPONSE_LANGUAGE_OPTIONS}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="ai-tone">Tone</label>
                <Select
                  value={form.tone}
                  onValueChange={(value) =>
                    setForm((prev) =>
                      prev
                        ? { ...prev, tone: value as AiUserPreferences["tone"] }
                        : prev,
                    )
                  }
                  disabled={readOnly}
                  items={TONE_OPTIONS}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="ai-verbosity">Verbosity</label>
                <Select
                  value={form.verbosity}
                  onValueChange={(value) =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            verbosity: value as AiUserPreferences["verbosity"],
                          }
                        : prev,
                    )
                  }
                  disabled={readOnly}
                  items={VERBOSITY_OPTIONS}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="ai-preferred-name">Preferred name</label>
                <div className="flex gap-2">
                  <Input
                    id="ai-preferred-name"
                    value={form.preferred_name}
                    onChange={(e) =>
                      setForm((prev) =>
                        prev ? { ...prev, preferred_name: e.target.value } : prev,
                      )
                    }
                    disabled={readOnly}
                    placeholder={profileName ?? "Optional"}
                    maxLength={64}
                  />
                  {!readOnly && form.preferred_name ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setForm((prev) =>
                          prev ? { ...prev, preferred_name: "" } : prev,
                        )
                      }
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            </fieldset>

            {!readOnly ? (
              <Button
                type="button"
                onClick={() => saveMutation.mutate()}
                isLoading={saveMutation.isPending}
              >
                Save memory
              </Button>
            ) : (
              <p className="text-sm text-text-muted">Read-only</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
