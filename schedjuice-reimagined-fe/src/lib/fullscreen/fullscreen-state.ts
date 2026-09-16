interface FullscreenDerivationInput {
  requestedFullscreen: boolean;
  isFullscreenAvailable: boolean;
}

export function deriveEffectiveFullscreen({
  requestedFullscreen,
  isFullscreenAvailable,
}: FullscreenDerivationInput): boolean {
  return requestedFullscreen && isFullscreenAvailable;
}

export function shouldClearRequestedFullscreen({
  requestedFullscreen,
  isFullscreenAvailable,
}: FullscreenDerivationInput): boolean {
  return requestedFullscreen && !isFullscreenAvailable;
}
