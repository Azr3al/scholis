"use client";

import { CompletionSheet } from "./completion-sheet";

export function AdminCompletionSheet({
  open,
  onOpenChange,
  userId,
  roles,
  userName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: number;
  roles: string[];
  userName: string;
}) {
  return (
    <CompletionSheet
      open={open}
      onOpenChange={onOpenChange}
      userId={userId}
      roles={roles}
      audience="admin"
      title={`Complete ${userName}'s profile`}
      description="Fields that staff are responsible for. Save each section as you go."
    />
  );
}
