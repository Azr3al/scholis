<<<<<<< HEAD
export default function HomePage() {
  return (
    <main>
      <h1>Scholis</h1>
      <p>Phase 0 — foundations. Authoring lands in Phase 4.</p>
=======
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Scholis</h1>
        <p className="mt-2 text-muted-foreground">
          Online assessment that keeps working when the wifi doesn&apos;t.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/take">
          <Button size="lg">I&apos;m taking a test</Button>
        </Link>
        <Link href="/sign-in">
          <Button size="lg" variant="outline">
            Teacher sign in
          </Button>
        </Link>
      </div>
>>>>>>> master
    </main>
  );
}
