let audioContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
}

/** Returns a running AudioContext, or null if resume failed / unavailable. */
export async function ensureAudioRunning(): Promise<AudioContext | null> {
  if (typeof window === "undefined") return null;

  try {
    const ctx = getSharedAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx.state === "running" ? ctx : null;
  } catch {
    return null;
  }
}
