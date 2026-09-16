"use client";
import { useToast } from "@/components/primitives";
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      // Fresh-within-30s data skips the refetch-on-navigation storm; anything
      // older still refetches on mount exactly as before.
      staleTime: 30_000,
      // retry: 3 amplified every request 4x during backend slowness.
      retry: 1,

      onError: (error: any) => {
      },
    },
  },
});

export { queryClient };
