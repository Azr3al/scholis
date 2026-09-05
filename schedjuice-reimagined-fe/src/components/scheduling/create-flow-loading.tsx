import { Skeleton } from "@/components/primitives";

export function CreateFlowLoading({ message }: { message?: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={message ?? "Loading"}>
      {message ? (
        <p className="text-sm text-text-muted">{message}</p>
      ) : null}
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}
