/** Delegated scope for this app's own API — required as the OBO user assertion at login. */
export function microsoftApiAccessScope(clientId: string): string {
  const appId = clientId.trim();
  return `api://${appId}/access_as_user`;
}
