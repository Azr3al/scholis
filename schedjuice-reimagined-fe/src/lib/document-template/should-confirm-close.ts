export function shouldConfirmClose({
  dirty,
  userAccepted,
}: {
  dirty: boolean;
  userAccepted: boolean;
}): boolean {
  return dirty && !userAccepted;
}
