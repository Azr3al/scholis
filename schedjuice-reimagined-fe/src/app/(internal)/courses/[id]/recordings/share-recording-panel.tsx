"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "iconoir-react";
import { Input } from "@/components/primitives";
import { Button } from "@/components/primitives";
import { Skeleton } from "@/components/primitives";
import { useToast } from "@/components/primitives";

interface Props {
  url: string | null;
  isLoading: boolean;
  isError: boolean;
  expiresInDays?: number;
  onRetry: () => void;
}

export default function ShareRecordingPanel({
  url,
  isLoading,
  isError,
  expiresInDays = 10,
  onRetry,
}: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [url]);

  function handleCopy() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.add({ title: "Share link copied." });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section
      aria-label="Share recording"
      className="min-h-[5.5rem] rounded-xl border border-border/60 bg-surface-hover/10 p-4"
    >
      <p className="mb-3 text-xs text-text-muted">
        Anyone with this link can view this recording. Expires in {expiresInDays}{" "}
        days.
      </p>

      {isError ? (
        <div className="flex min-h-10 flex-wrap items-center gap-2">
          <p className="text-sm text-destructive">
            Could not generate share link.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex min-h-10 items-center gap-2">
          <Skeleton className="h-10 min-h-10 flex-1" />
          <Skeleton className="h-10 w-10 shrink-0" />
        </div>
      ) : (
        <div className="flex min-h-10 items-center gap-2">
          <Input
            readOnly
            value={url ?? ""}
            className="font-mono text-xs"
            onClick={(e) => (e.target as HTMLInputElement).select()}
            aria-label="Share link"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleCopy}
            disabled={!url}
            aria-label={copied ? "Copied" : "Copy link"}
            className="size-9 shrink-0 p-0 active:scale-[0.98]"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
