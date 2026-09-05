import { PageContainer } from "@/components/layout/page-container";
import { cn } from "@/lib/utils";

function RecordBone({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded bg-surface-skeleton", className)}
    />
  );
}

export function RecordPageSkeleton() {
  return (
    <PageContainer
      width="default"
      className="flex w-full flex-col items-stretch gap-8"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <div className="sj-root flex flex-col gap-8">
        <div className="-mx-4 -mt-6 sm:-mx-6 lg:-mx-8">
          <RecordBone className="h-32 w-full rounded-none sm:h-40" />

          <div className="relative px-4 pb-5 pt-14 sm:px-6 sm:pb-6 sm:pt-5">
            <RecordBone className="absolute left-1/2 top-0 z-20 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-surface-elevated sm:left-8 sm:size-28 sm:translate-x-0" />

            <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:min-h-18 sm:items-start sm:pl-35 sm:text-left">
              <RecordBone className="h-8 w-56 max-w-full sm:h-9" />
              <RecordBone className="h-4 w-72 max-w-full" />
              <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                <RecordBone className="h-6 w-16 rounded-full" />
                <RecordBone className="h-6 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <RecordBone key={index} className="h-8 w-24 shrink-0 rounded-full" />
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <RecordBone key={index} className="min-h-24 rounded-xl" />
          ))}
        </div>

        <RecordBone className="h-64 w-full rounded-xl" />
      </div>
    </PageContainer>
  );
}
