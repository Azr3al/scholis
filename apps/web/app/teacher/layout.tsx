'use client';

import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

// A thin shell, not a nav system. There are two teacher screens and the only
// things missing were a way back to the list and a way out.
export default function TeacherLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/teacher" className="font-semibold tracking-tight">
            Scholis
          </Link>
          <Link href="/teacher/team" className="text-sm text-muted-foreground transition-ui hover:text-foreground" data-testid="team-link">
            Team
          </Link>
          <Button
            variant="ghost"
            size="sm"
            data-testid="sign-out"
            onClick={() => {
              void signOut().then(() => {
                router.push('/sign-in');
              });
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}
