import type { QueryClient } from "@tanstack/react-query";

export function invalidateHelpDocsQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["help-categories"] });
  void queryClient.invalidateQueries({ queryKey: ["help-articles"] });
  void queryClient.invalidateQueries({ queryKey: ["help-article"] });
}
