"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { PostHogProvider } from "@/components/providers/posthog-provider";

import { queryClient } from "@/lib/query";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PostHogProvider>{children}</PostHogProvider>
    </QueryClientProvider>
  );
}
