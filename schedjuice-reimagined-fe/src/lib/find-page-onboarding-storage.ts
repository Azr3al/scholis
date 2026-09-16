const FIND_PAGE_DIALOG_KEY = "sj:find-page-onboarding-dialog";
const FIND_PAGE_COACHMARK_KEY = "sj:find-page-onboarding-coachmark";

function canUseLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function hasSeenFindPageDialog(): boolean {
  if (!canUseLocalStorage()) return true;
  return localStorage.getItem(FIND_PAGE_DIALOG_KEY) === "1";
}

export function hasSeenFindPageCoachmark(): boolean {
  if (!canUseLocalStorage()) return true;
  return localStorage.getItem(FIND_PAGE_COACHMARK_KEY) === "1";
}

export function markFindPageDialogSeen(): void {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(FIND_PAGE_DIALOG_KEY, "1");
}

export function markFindPageCoachmarkSeen(): void {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(FIND_PAGE_COACHMARK_KEY, "1");
}

export function replayFindPageOnboarding(): void {
  if (!canUseLocalStorage()) return;
  localStorage.removeItem(FIND_PAGE_DIALOG_KEY);
  localStorage.removeItem(FIND_PAGE_COACHMARK_KEY);
}
