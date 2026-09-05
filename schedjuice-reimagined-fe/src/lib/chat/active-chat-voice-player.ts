/** Ensures only one inline voice clip plays per thread/screen. */
let activeStopCallback: (() => void) | null = null;

export function claimActiveChatVoicePlayer(stop: () => void): void {
  if (activeStopCallback && activeStopCallback !== stop) {
    activeStopCallback();
  }
  activeStopCallback = stop;
}

export function releaseActiveChatVoicePlayer(stop: () => void): void {
  if (activeStopCallback === stop) {
    activeStopCallback = null;
  }
}
