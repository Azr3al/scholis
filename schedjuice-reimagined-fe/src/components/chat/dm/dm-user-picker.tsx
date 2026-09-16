"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Avatar, Button, Dialog, Input } from "@/components/primitives";

import { useDebouncedCallback } from "use-debounce";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDmEligibleUsers } from "@/lib/chat-threads/chat-threads-api";
import type { DmEligibleUser } from "@/types/chat";
import { dmChatCopy } from "@/messages/dm-chat";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (user: DmEligibleUser) => void;
  isBusy?: boolean;
};

export function DmUserPicker({ open, onOpenChange, onPick, isBusy }: Props) {
  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const setQDebounced = useDebouncedCallback((q: string) => {
    setDebouncedQ(q.trim());
  }, 300);

  useEffect(() => {
    setQDebounced(rawQuery);
    return () => {
      setQDebounced.cancel();
    };
  }, [rawQuery, setQDebounced]);

  useEffect(() => {
    if (!open) {
      setRawQuery("");
      setDebouncedQ("");
    }
  }, [open]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dm-eligible-users", debouncedQ, open],
    queryFn: () =>
      fetchDmEligibleUsers({
        q: debouncedQ || undefined,
        page: 1,
        size: 50,
      }),
    enabled: open,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const results = data?.results ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="sm:max-w-md gap-3">
        <div className="text-left gap-2">
          <Dialog.Title>{dmChatCopy.pickerTitle}</Dialog.Title>
          <Dialog.Description>{dmChatCopy.pickerDescription}</Dialog.Description>
        </div>
        <Input
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder={dmChatCopy.pickerSearchPlaceholder}
          autoFocus={open}
          disabled={isBusy}
        />
        <div
          className="max-h-72 overflow-y-auto rounded-md border border-border"
          aria-busy={isLoading}
        >
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Spinner className="h-4 w-4 shrink-0" aria-hidden />
              {dmChatCopy.pickerLoading}
            </p>
          ) : isError ? (
            <div className="p-4 text-sm text-destructive space-y-2">
              <p>{dmChatCopy.pickerError}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => void refetch()}>
                {dmChatCopy.pickerRetry}
              </Button>
            </div>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{dmChatCopy.pickerEmpty}</p>
          ) : (
            <ul role="listbox" className="divide-y divide-border">
              {results.map((person) => {
                const initials = (person.name || person.email || "U")
                  .slice(0, 2)
                  .toUpperCase();
                const label =
                  person.name?.trim() || person.email?.trim() || dmChatCopy.unknownUserLabel;
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      disabled={isBusy}
                      className={cn(
                        "flex w-full items-center gap-3 p-3 text-left text-sm hover:bg-muted/60 transition-colors disabled:opacity-50"
                      )}
                      onClick={() => onPick(person)}
                    >
                      <Avatar className="h-9 w-9 rounded-full shrink-0" src={person.profile_image ?? undefined} name={initials} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium truncate block">{label}</span>
                        {person.email ? (
                          <span className="text-muted-foreground text-xs truncate block">
                            {person.email}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            {dmChatCopy.cancelAction}
          </Button>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
