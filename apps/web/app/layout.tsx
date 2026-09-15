import { cn } from '@/lib/utils';
import type { Metadata } from 'next';
// Self-hosted: the font files ship in the `geist` package, so `next build`
// does not have to reach fonts.googleapis.com. `next/font/google` fetches at
// build time and fails the build outright when it cannot — which is what made
// the web image unbuildable anywhere without that egress.
import { GeistSans } from 'geist/font/sans';
import type { ReactNode } from 'react';
// KaTeX ships its own stylesheet; equations render as unstyled markup without it.
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Scholis',
  description: 'Online assessment that survives a bad connection.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', GeistSans.variable)}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
