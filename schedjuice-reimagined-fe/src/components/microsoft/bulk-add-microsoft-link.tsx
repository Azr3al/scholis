"use client";
import { Button, Skeleton, buttonVariants, useToast } from "@/components/primitives";

import {
  getMicrosoftUserSuggestions,
  linkUserMicrosoftAccount,
  MicrosoftUserSuggestion,
} from "@/app/client-api/microsoft";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { accountType } from "@/types/user";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";

export function BulkAddMicrosoftLink({
  user,
  onLinked,
}: {
  user: accountType;
  onLinked: (userId: number, microsoftId: string) => void;
}) {
  const toast = useToast();

  const suggestionsQuery = useQuery({
    queryKey: ["microsoftSuggestions", user.id, user.email],
    queryFn: async () => {
      const { data } = await getMicrosoftUserSuggestions(user.id, user.email);
      return (data.data ?? []) as MicrosoftUserSuggestion[];
    },
    staleTime: 1000 * 60,
  });

  const linkMutation = useMutation({
    mutationFn: (suggestion: MicrosoftUserSuggestion) =>
      linkUserMicrosoftAccount(
        user.id,
        suggestion.microsoft_id || suggestion.user_principal_name,
      ),
    onSuccess: (_res, suggestion) => {
      toast.add({ title: "Microsoft account linked" });
      onLinked(user.id, suggestion.microsoft_id);
    },
    onError: (error) => {
      toast.add({
        type: "error",
        title: "Could not link Microsoft account",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  if (suggestionsQuery.isLoading) {
    return (
      <div className="ml-4 mt-1 space-y-1" aria-hidden>
        <Skeleton className="h-8 w-full max-w-md" />
      </div>
    );
  }

  if (suggestionsQuery.isError) {
    return (
      <p className="ml-4 mt-1 text-sm text-muted-foreground">
        Could not search Microsoft 365.{" "}
        <Link href={`/users/${user.id}`} className="underline underline-offset-2">
          Link on the user profile
        </Link>
        .
      </p>
    );
  }

  const suggestions = suggestionsQuery.data ?? [];
  if (suggestions.length === 0) {
    return (
      <p className="ml-4 mt-1 text-sm text-muted-foreground">
        No matching Microsoft account found.{" "}
        <Link href={`/users/${user.id}`} className="underline underline-offset-2">
          Create or link on the user profile
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="ml-4 mt-1 space-y-2">
      {suggestions.map((suggestion) => {
        const label =
          suggestion.match_type === "exact_email"
            ? "Exact email match found"
            : "Possible match";
        const identity =
          suggestion.user_principal_name ||
          suggestion.mail ||
          suggestion.display_name;

        return (
          <div
            key={suggestion.microsoft_id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">
              {label}:{" "}
              <span className="text-foreground">
                {suggestion.display_name || identity}
              </span>
              {identity ? (
                <span className="text-muted-foreground"> ({identity})</span>
              ) : null}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary" onClick={() => linkMutation.mutate(suggestion)}
              isLoading={
                linkMutation.isLoading &&
                linkMutation.variables?.microsoft_id === suggestion.microsoft_id
              }
              disabled={linkMutation.isLoading}
              className="active:scale-[0.98] transition-transform"
            >
              Link
            </Button>
          </div>
        );
      })}
    </div>
  );
}
