import { cn } from '@/lib/utils';
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import type { ReactNode } from 'react';
// KaTeX ships its own stylesheet; equations render as unstyled markup without it.
import 'katex/dist/katex.min.css';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Scholis',
  description: 'Online assessment that survives a bad connection.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable)}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
