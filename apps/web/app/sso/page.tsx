'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

const signInLink = (
  <Link className="underline underline-offset-4" href="/sign-in">
    sign in with an email link
  </Link>
);

/**
 * Landing page for a teacher arriving from another system.
 *
 * The integrating platform has already authenticated this person, so there is
 * no form here and nothing to type. The ticket in the link is exchanged for a
 * session and the teacher is sent into their library.
 *
 * The exchange happens once, and proving that is the interesting part. React
 * StrictMode mounts effects twice in development, and a ticket is single-use by
 * design — without the ref below, every developer would watch their second
 * mount fail with "already used" and reasonably conclude the feature was
 * broken. The ref, not the state, is what makes it single-shot: a state update
 * is not visible to the second invocation of the same effect run.
 */
const SsoExchange = () => {
  const params = useSearchParams();
  const router = useRouter();
  const ticket = params.get('ticket') ?? '';

  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (ticket === '' || attempted.current) return;
    attempted.current = true;

    const exchange = async () => {
      try {
        await api.exchangeTeacherSso({ ticket });
        router.replace('/teacher');
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'That sign-in link could not be used. Try again.',
        );
      }
    };

    void exchange();
  }, [ticket, router]);

  if (ticket === '') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign-in link incomplete</CardTitle>
          <CardDescription data-testid="sso-incomplete">
            That link is missing its ticket. Go back to the platform you came from and try again, or{' '}
            {signInLink}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error !== null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>That link did not work</CardTitle>
          <CardDescription data-testid="sso-error">{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Sign-in links are short-lived and work once. Go back and open Scholis again for a fresh
            one, or {signInLink}.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signing you in…</CardTitle>
        <CardDescription data-testid="sso-working">
          You&apos;ll land in your test library in a moment.
        </CardDescription>
      </CardHeader>
    </Card>
  );
};

export default function SsoPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      {/* useSearchParams needs a Suspense boundary in the App Router. */}
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <SsoExchange />
      </Suspense>
    </main>
  );
}
