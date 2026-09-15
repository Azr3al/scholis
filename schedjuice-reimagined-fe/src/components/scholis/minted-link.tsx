"use client";

import { useEffect, useState } from "react";
import { Check, Copy, OpenNewWindow, WarningTriangle } from "iconoir-react";

import { Button, Input, useToast } from "@/components/primitives";

/**
 * A one-time link, shown once.
 *
 * Both kinds of link this renders are bearer credentials: a launch URL admits
 * whoever holds it to an exam as a specific student, and a teacher sign-in URL
 * opens a staff session at Scholis as that teacher. Neither is stored anywhere —
 * not here, not in the backend — so this panel is the only copy that will ever
 * exist, and the wording says so.
 *
 * The warning is not decoration. A link like this forwarded to a group chat is
 * indistinguishable from the real recipient using it, and nothing downstream can
 * tell the difference.
 */
type Props = {
  url: string;
  /** ISO timestamp, or null when the issuer did not give one. */
  expiresAt?: string | null;
  /** Who or what the link admits, for the warning line. */
  subject: string;
  /** e.g. "Launch link copied." */
  copiedTitle?: string;
  ariaLabel?: string;
};

function describeExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const then = new Date(expiresAt).getTime();
  if (Number.isNaN(then)) return null;
  const minutes = Math.round((then - Date.now()) / 60_000);
  if (minutes <= 0) return "It has already expired.";
  if (minutes < 60) return `It expires in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  const hours = Math.round(minutes / 60);
  return `It expires in about ${hours} hour${hours === 1 ? "" : "s"}.`;
}

export function MintedLink({
  url,
  expiresAt,
  subject,
  copiedTitle = "Link copied.",
  ariaLabel = "One-time link",
}: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [expiry, setExpiry] = useState<string | null>(null);

  // Recomputed rather than derived once: the panel can stay open long enough for
  // "expires in about 12 minutes" to become a lie, and a stale countdown next to
  // a link that no longer works is how a student gets locked out of an exam while
  // the teacher believes they have time left.
  useEffect(() => {
    const update = () => setExpiry(describeExpiry(expiresAt));
    update();
    if (!expiresAt) return;
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  // A new link is a new copy state; leaving the previous tick would read as
  // "already copied" for a URL nobody has copied.
  useEffect(() => {
    setCopied(false);
  }, [url]);

  function handleCopy() {
    void navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        toast.add({ title: copiedTitle });
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => {
        // Clipboard access is denied in enough contexts (older browsers, some
        // embedding) that failing silently here would leave the user with no link
        // at all. The field is selectable, so say so.
        toast.add({
          title: "Could not copy",
          description: "Select the link in the field and copy it manually.",
        });
      },
    );
  }

  return (
    <section
      aria-label={ariaLabel}
      className="rounded-xl border border-border/60 bg-surface-hover/10 p-4"
    >
      <div className="mb-3 flex items-start gap-2">
        <WarningTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
        <p className="text-xs leading-relaxed text-text-secondary">
          This link is shown once and is not stored anywhere. Anyone holding it
          can act as {subject}. {expiry ? `${expiry} ` : ""}
          If it is lost, mint a new one.
        </p>
      </div>

      <div className="flex min-h-10 items-center gap-2">
        <Input
          readOnly
          value={url}
          className="font-mono text-xs"
          onClick={(e) => (e.target as HTMLInputElement).select()}
          onFocus={(e) => (e.target as HTMLInputElement).select()}
          aria-label={ariaLabel}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy link"}
          className="size-9 shrink-0 p-0 active:scale-[0.98]"
        >
          {copied ? (
            <Check className="size-4 text-green-500" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          aria-label="Open link in a new tab"
          className="size-9 shrink-0 p-0 active:scale-[0.98]"
        >
          <OpenNewWindow className="size-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
