export function shouldPromptMicrosoftTeamsConnect(
  teamsSyncEligible: boolean,
  postToTeams: boolean,
  msPersonalConnected: boolean,
): boolean {
  return teamsSyncEligible && postToTeams && !msPersonalConnected;
}
