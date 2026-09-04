'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface Team {
  members: { id: string; email: string; name: string; role: 'owner' | 'teacher' }[];
  invites: { id: string; email: string; expiresAt: string }[];
}

/**
 * The team, which is the organisation.
 *
 * Everyone here shares one quiz library, because tests are scoped by org and
 * always have been. There is nothing to grant — being in the team *is* the
 * access — so this page lists people and sends invitations, and that is all.
 */
export default function TeamPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [email, setEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .getTeam()
      .then(setTeam)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not load your team.');
      });
  }, []);

  useEffect(load, [load]);

  const invite = async () => {
    setBusy(true);
    setError(null);
    setInviteUrl(null);

    try {
      const result = await api.inviteMember({ email: email.trim() });
      // Shown as well as emailed. Development prints the mail to a console, and
      // a teacher whose colleague never got it needs something to paste.
      setInviteUrl(result.url);
      setEmail('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that invitation.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link
          href="/teacher"
          className="text-sm text-muted-foreground transition-ui hover:text-foreground"
        >
          ← All tests
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your team</h1>
        <p className="text-sm text-muted-foreground">
          Everyone here can see and edit the same quizzes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void invite();
            }}
          >
            <div className="grid flex-1 gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                placeholder="colleague@school.example"
                data-testid="invite-email"
              />
            </div>
            <Button type="submit" disabled={busy} data-testid="invite-submit">
              {busy ? 'Inviting…' : 'Send invitation'}
            </Button>
          </form>

          {inviteUrl !== null && (
            // The link is its own element so that selecting it picks up the URL
            // and nothing else — this is text a teacher pastes into an email.
            <p className="mt-3 text-sm">
              Invitation link:{' '}
              <span className="break-all" data-testid="invite-url">
                {inviteUrl}
              </span>
            </p>
          )}

          {error !== null && (
            <p className="mt-3 text-sm text-destructive" data-testid="team-error">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2" data-testid="team-members">
          {team === null && <p className="text-sm text-muted-foreground">Loading…</p>}
          {team?.members.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {member.name} <span className="text-muted-foreground">{member.email}</span>
              </span>
              <span className="text-xs text-muted-foreground">{member.role}</span>
            </div>
          ))}

          {team !== null && team.invites.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="team-invites">
              <p className="mt-2 text-xs font-medium text-muted-foreground">Pending invitations</p>
              {team.invites.map((pending) => (
                <div key={pending.id} className="text-sm text-muted-foreground">
                  {pending.email} — invited
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
