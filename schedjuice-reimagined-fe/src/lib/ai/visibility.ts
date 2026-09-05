import { permissionsFor } from "@/helpers/authorization";
import type { accountType } from "@/types/user";

export function canViewAiSection({
  subject,
  viewer,
}: {
  subject: accountType;
  viewer: accountType;
}): boolean {
  const perms = permissionsFor(viewer);
  const isSelf = viewer.id === subject.id;
  if (isSelf) {
    return (
      perms.can("ai.usage.view_own") || perms.can("ai.memory.view_own")
    );
  }
  return perms.can("ai.usage.view_all") || perms.can("ai.memory.view_all");
}

export function canViewAiUsage({
  subject,
  viewer,
}: {
  subject: accountType;
  viewer: accountType;
}): boolean {
  const perms = permissionsFor(viewer);
  if (viewer.id === subject.id) {
    return perms.can("ai.usage.view_own");
  }
  return perms.can("ai.usage.view_all");
}

export function canViewAiMemory({
  subject,
  viewer,
}: {
  subject: accountType;
  viewer: accountType;
}): boolean {
  const perms = permissionsFor(viewer);
  if (viewer.id === subject.id) {
    return perms.can("ai.memory.view_own");
  }
  return perms.can("ai.memory.view_all");
}

export function canManageAiMemory({
  subject,
  viewer,
}: {
  subject: accountType;
  viewer: accountType;
}): boolean {
  const perms = permissionsFor(viewer);
  if (viewer.id === subject.id) {
    return perms.can("ai.memory.manage_own");
  }
  return perms.can("ai.memory.manage_all");
}

export function canManageAiLimits({
  subject,
  viewer,
}: {
  subject: accountType;
  viewer: accountType;
}): boolean {
  return (
    viewer.id !== subject.id &&
    permissionsFor(viewer).can("ai.memory.manage_all")
  );
}

export function canViewAiLimits({
  subject,
  viewer,
}: {
  subject: accountType;
  viewer: accountType;
}): boolean {
  return canViewAiUsage({ subject, viewer }) || canManageAiLimits({ subject, viewer });
}
