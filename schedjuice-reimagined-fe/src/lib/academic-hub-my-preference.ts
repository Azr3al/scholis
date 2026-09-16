export const ACADEMIC_HUB_MY_CLASSES_ONLY_KEY_PREFIX =
  "academicHub:myClassesOnly:";

function storageKey(userId: number): string {
  return `${ACADEMIC_HUB_MY_CLASSES_ONLY_KEY_PREFIX}${userId}`;
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function resolveMyDefault(
  isAdminOrManager: boolean,
  isTeacher: boolean,
): boolean {
  if (isAdminOrManager) return false;
  if (isTeacher) return true;
  return false;
}

export function getAcademicHubMyClassesOnly(userId: number): boolean | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function setAcademicHubMyClassesOnly(
  userId: number,
  value: boolean,
): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(storageKey(userId), value ? "true" : "false");
  } catch {
    // Quota / private mode — URL state still works for the session.
  }
}
