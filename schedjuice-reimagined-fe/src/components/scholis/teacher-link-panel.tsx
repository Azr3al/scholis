"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Key } from "iconoir-react";

import { Button, Field, Input, useToast } from "@/components/primitives";
import { MintedLink } from "@/components/scholis/minted-link";
import { mintScholisTeacherLink, scholisErrorMessage } from "@/lib/scholis-api";
import type { ScholisTeacherLink } from "@/types/scholis";

/**
 * Mint a Scholis sign-in link for one teacher.
 *
 * Gated server-side on ``organization.manage`` rather than a grading permission.
 * The link opens a staff session at Scholis for whoever holds it, so minting one
 * for another person is close enough to impersonation that it should not be
 * available to everybody who can manage grades.
 */
export function ScholisTeacherLinkPanel() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<ScholisTeacherLink | null>(null);

  const mint = useMutation({
    mutationKey: ["scholis", "teacher-link"],
    mutationFn: (address: string) => mintScholisTeacherLink({ email: address }),
    onSuccess: (result) => {
      setLink(result);
      toast.add({ title: "Sign-in link ready", description: `For ${result.email}.` });
    },
    onError: (error) => {
      setLink(null);
      // A 404 here is the common case and is not a malfunction: the teacher has
      // no account at Scholis yet and has to be invited there first. The backend
      // already words it that way, so it is passed through rather than replaced.
      toast.add({
        title: "No link was created",
        description: scholisErrorMessage(
          error,
          "Scholis could not create a sign-in link for that address.",
        ),
      });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    mint.mutate(address);
  }

  return (
    <section
      aria-label="Teacher sign-in"
      className="rounded-xl border border-border/60 bg-surface p-5"
    >
      <div className="mb-1 flex items-center gap-2">
        <Key className="size-4 text-text-muted" aria-hidden />
        <h2 className="text-base font-medium text-text-primary">Teacher sign-in</h2>
      </div>
      <p className="mb-4 text-sm text-text-muted">
        Sends a teacher to their own Scholis account without a second password.
        This cannot create an account — a teacher Scholis has not heard of has to
        be invited there first.
      </p>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field.Root className="min-w-64 flex-1">
          <Field.Label htmlFor="scholis-teacher-email">Teacher email</Field.Label>
          <Input
            id="scholis-teacher-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teacher@school.example"
            autoComplete="email"
            required
          />
          <Field.Description>
            Matched at Scholis by address. Surrounding spaces are trimmed here,
            because their API rejects them and that reads like a broken
            integration.
          </Field.Description>
        </Field.Root>

        <Button
          type="submit"
          variant="secondary"
          isLoading={mint.isLoading}
          disabled={!email.trim()}
        >
          Create sign-in link
        </Button>
      </form>

      {link ? (
        <div className="mt-4">
          <MintedLink
            url={link.url}
            expiresAt={link.expires_at}
            subject={`${link.email} at Scholis`}
            copiedTitle="Sign-in link copied."
            ariaLabel="Teacher sign-in link"
          />
        </div>
      ) : null}
    </section>
  );
}
