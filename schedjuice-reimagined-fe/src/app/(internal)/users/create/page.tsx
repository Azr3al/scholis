"use client";

import { PageContainer } from "@/components/layout/page-container";
import BackButton from "@/components/misc/back-button";
import { UserForm } from "@/components/users/user-form";
import { UserCreateFormSkeleton } from "@/components/users/user-create-form-skeleton";
import { TypographyH1 } from "@/components/typography/h1";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";

const UserCreatePage: React.FC = () => {
  const { user } = useUser();
  const { tenant } = useTenant();

  return (
    <PageContainer width="narrow" className="space-y-3">
      <BackButton href="/users" />
      <div className="space-y-1">
        <TypographyH1>Add a person</TypographyH1>
        <p className="text-sm text-text-secondary">
          Start with profile and access details. You can add more information on
          the next step or skip it.
        </p>
      </div>

      {(!user || !tenant) && <UserCreateFormSkeleton />}

      {user && tenant && (
        <UserForm mode="create" viewerAccount={user} actor="admin" measure="narrow" />
      )}
    </PageContainer>
  );
};

export default UserCreatePage;
