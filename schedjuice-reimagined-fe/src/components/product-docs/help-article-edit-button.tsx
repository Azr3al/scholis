"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { EditPencil } from "iconoir-react";

import { isSuperAdmin } from "@/helpers/authorization";
import { usePlatformAdminNavigate } from "@/hooks/usePlatformAdminNavigate";
import { useUser } from "@/hooks/useUser";

type HelpArticleEditButtonProps = {
  articleId: number;
};

export function HelpArticleEditButton({ articleId }: HelpArticleEditButtonProps) {
  const { realUser, isLoading: userLoading } = useUser();
  const { navigateToPlatformPath, isReady, isLoadingContext } =
    usePlatformAdminNavigate();

  if (userLoading || !isSuperAdmin(realUser)) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="secondary" size="sm"
      disabled={!isReady || isLoadingContext}
      onClick={() => navigateToPlatformPath(`/platform/docs/${articleId}`)}
    >
      <EditPencil width={16} height={16} aria-hidden />
      Edit
    </Button>
  );
}
