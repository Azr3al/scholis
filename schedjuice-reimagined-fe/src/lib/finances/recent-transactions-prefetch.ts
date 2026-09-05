export const RECENT_TRANSACTIONS_MAX_AUTO_PREFETCH = 2;

export function shouldFetchNextPage(args: {
  isIntersecting: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  hasUserScrolled: boolean;
  autoPrefetchCount: number;
  maxAutoPrefetch: number;
}): boolean {
  if (!args.isIntersecting || !args.hasNextPage || args.isFetchingNextPage) {
    return false;
  }
  if (args.hasUserScrolled) {
    return true;
  }
  return args.autoPrefetchCount < args.maxAutoPrefetch;
}
