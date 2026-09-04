'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';
import { useState } from 'react';

/**
 * Creating a teacher account, and the team that comes with it.
 *
 * Two steps behind one button: the account and its organisation are created
 * first, then a magic link is sent. Sign-in still never provisions — this page
 * is the only door that does, which keeps the guarantee that an unknown
 * address at the sign-in form is refused rather than onboarded.
 */
export default function SignUpPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [teamName, setTeamName] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setState('working');
    setError(null);

    try {
      await api.signUp({
        name: name.trim(),
        email: email.trim(),
        ...(teamName.trim() === '' ? {} : { teamName: teamName.trim() }),
      });

      // The account exists now, so this is an ordinary sign-in.
      const { error: linkError } = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: `${window.location.origin}/teacher`,
      });
      if (linkError) throw new Error(linkError.message ?? 'Could not send your sign-in link.');

      setState('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your account.');
      setState('idle');
    }
  };

  if (state === 'sent') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        <Card>
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              Your team is ready. We&apos;ve sent a sign-in link to {email}.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>No password — we&apos;ll email you a link.</CardDescription>
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
                data-testid="signup-name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                placeholder="you@school.example"
                data-testid="signup-email"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="team">Team name</Label>
              <Input
                id="team"
                value={teamName}
                onChange={(e) => {
                  setTeamName(e.target.value);
                }}
                placeholder="Optional — your department or school"
                data-testid="signup-team"
              />
              <p className="text-xs text-muted-foreground">
                You can invite colleagues later. Leave blank and we&apos;ll name it after you.
              </p>
            </div>

            <Button type="submit" disabled={state === 'working'} data-testid="signup-submit">
              {state === 'working' ? 'Creating…' : 'Create account'}
            </Button>

            {error !== null && (
              <p className="text-sm text-destructive" data-testid="signup-error">
                {error}
              </p>
            )}

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/sign-in" className="underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
