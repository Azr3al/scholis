'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

/**
 * Accepting an invitation.
 *
 * The token in the link is the authorisation — the invitee has no account yet,
 * so there is nobody to authenticate. Same shape as a student arriving with a
 * test code, and the token is single-use and expires.
 *
 * The email is not asked for: it is fixed by the invitation, so letting
 * someone type one would just be a way to join under the wrong address.
 */
const JoinForm = () => {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setState('working');
    setError(null);

    try {
      const { email } = await api.acceptInvite({ token, name: name.trim() });

      const { error: linkError } = await authClient.signIn.magicLink({
        email,
        callbackURL: `${window.location.origin}/teacher`,
      });
      if (linkError) throw new Error(linkError.message ?? 'Could not send your sign-in link.');

      setState('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept that invitation.');
      setState('idle');
    }
  };

  if (token === '') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation link incomplete</CardTitle>
          <CardDescription>
            That link is missing its token. Ask whoever invited you to send it again.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state === 'sent') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You&apos;re in</CardTitle>
          <CardDescription>
            Check your email for a sign-in link. You&apos;ll land in the team&apos;s shared library.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join the team</CardTitle>
        <CardDescription>You&apos;ll share a quiz library with your colleagues.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              placeholder="Ada Lovelace"
              data-testid="join-name"
            />
          </div>

          <Button type="submit" disabled={state === 'working'} data-testid="join-submit">
            {state === 'working' ? 'Joining…' : 'Accept invitation'}
          </Button>

          {error !== null && (
            <p className="text-sm text-destructive" data-testid="join-error">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
};

export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      {/* useSearchParams needs a Suspense boundary in the App Router. */}
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <JoinForm />
      </Suspense>
    </main>
  );
}
