import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/primitives";
import { UserCreateFormSkeleton } from "@/components/users/user-create-form-skeleton";

export default function UserCreateLoading() {
  return (
    <PageContainer
      width="narrow"
      className="space-y-3"
      aria-busy="true"
      aria-label="Loading person form"
    >
      <Skeleton className="h-8 w-20" />
      <div className="space-y-1">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <UserCreateFormSkeleton />
    </PageContainer>
  );
}
