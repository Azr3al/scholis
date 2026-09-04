'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';
import { useState } from 'react';

type State =
  { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

interface FieldErrors {
  email?: string;
}

const looksLikeEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<State>({ kind: 'idle' });

  const send = async () => {
    const trimmed = email.trim();
    const errors: FieldErrors = {};
    if (trimmed === '') errors.email = 'Enter your email address.';
    else if (!looksLikeEmail(trimmed)) errors.email = 'Enter a valid email address.';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setState({ kind: 'sending' });
    const { error } = await authClient.signIn.magicLink({
      email: trimmed,
      callbackURL: `${window.location.origin}/teacher`,
    });

    // Accounts are provisioned by an admin, so an unknown address is a real
    // rejection rather than a signup prompt.
    setState(
      error
        ? { kind: 'error', message: error.message ?? 'Could not send the link.' }
        : { kind: 'sent' },
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Teacher sign in</CardTitle>
          <CardDescription>We&apos;ll email you a link. No password.</CardDescription>
        </CardHeader>
        <CardContent>
          {state.kind === 'sent' ? (
            <p className="text-sm" data-testid="magic-link-sent">
              Check your email for a sign-in link.
              <span className="mt-2 block text-muted-foreground">
                In development the link is printed in the API terminal.
              </span>
            </p>
          ) : (
            <form
              className="flex flex-col gap-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  aria-invalid={fieldErrors.email !== undefined}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email !== undefined) {
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.email;
                        return next;
                      });
                    }
                  }}
                  placeholder="you@school.test"
                />
                {fieldErrors.email !== undefined && (
                  <p className="text-sm text-destructive">{fieldErrors.email}</p>
                )}
              </div>

              {state.kind === 'error' && (
                <p className="text-sm text-destructive">{state.message}</p>
              )}

              <Button type="submit" disabled={state.kind === 'sending'}>
                {state.kind === 'sending' ? 'Sending…' : 'Send sign-in link'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/sign-up" className="underline underline-offset-4" data-testid="to-sign-up">
          Create an account
        </Link>
      </p>

    </main>
  );
}
