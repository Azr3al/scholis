import { ensureAudioRunning } from "./audio-context";
import { getUiSoundVolume, isUiSoundEnabled } from "./sound-preference";

/** Max rows that stagger + receive a tick (0–7). Rows beyond mount instantly. */
export const STAGGER_ENTRANCE_ROW_CAP = 8;

const BASE_GAIN = 0.20;
const TICK_DURATION_S = 0.07;
const PITCH_DROP_DURATION_S = 0.04;
const PITCH_DROP_RATIO = 0.03;
const OVERTONE_RATIO = 2.4;
const NOISE_DURATION_S = 0.004;

/** Ascending semitone from A4 (440 Hz). Exported for tests. */
export function staggerTickFrequencyHz(index: number): number {
  return 440 * Math.pow(2, index / 12);
}

function connectOutput(ctx: AudioContext, master: GainNode): void {
  try {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime((Math.random() - 0.5) * 0.4, ctx.currentTime);
    master.connect(panner);
    panner.connect(ctx.destination);
  } catch {
    master.connect(ctx.destination);
  }
}

function scheduleMarimbaPluck(
  ctx: AudioContext,
  master: GainNode,
  fundamentalHz: number,
  now: number,
  variation: number,
): void {
  const end = now + TICK_DURATION_S;
  const pitchEnd = now + PITCH_DROP_DURATION_S;
  const droppedFundamental = fundamentalHz * (1 - PITCH_DROP_RATIO);
  const droppedOvertone = fundamentalHz * OVERTONE_RATIO * (1 - PITCH_DROP_RATIO);

  const fundOsc = ctx.createOscillator();
  fundOsc.type = "sine";
  fundOsc.frequency.setValueAtTime(fundamentalHz, now);
  fundOsc.frequency.linearRampToValueAtTime(droppedFundamental, pitchEnd);

  const fundGain = ctx.createGain();
  fundGain.gain.setValueAtTime(0.65 * variation, now);
  fundGain.gain.exponentialRampToValueAtTime(0.001, end);

  fundOsc.connect(fundGain);
  fundGain.connect(master);
  fundOsc.start(now);
  fundOsc.stop(end + 0.005);

  const overtoneOsc = ctx.createOscillator();
  overtoneOsc.type = "sine";
  overtoneOsc.frequency.setValueAtTime(fundamentalHz * OVERTONE_RATIO, now);
  overtoneOsc.frequency.linearRampToValueAtTime(droppedOvertone, pitchEnd);

  const overtoneGain = ctx.createGain();
  overtoneGain.gain.setValueAtTime(0.25 * variation, now);
  overtoneGain.gain.exponentialRampToValueAtTime(0.001, end);

  overtoneOsc.connect(overtoneGain);
  overtoneGain.connect(master);
  overtoneOsc.start(now);
  overtoneOsc.stop(end + 0.005);

  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * NOISE_DURATION_S));
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(fundamentalHz * 1.5, now);
  bandpass.Q.setValueAtTime(2, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.08 * variation, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + NOISE_DURATION_S);

  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + NOISE_DURATION_S + 0.002);
}

/**
 * Marimba-style pluck for staggered list entrances.
 * Caller must pass index < STAGGER_ENTRANCE_ROW_CAP.
 */
export async function playStaggerTick(index: number): Promise<void> {
  if (typeof window === "undefined" || !isUiSoundEnabled()) return;
  if (index < 0 || index >= STAGGER_ENTRANCE_ROW_CAP) return;

  try {
    const ctx = await ensureAudioRunning();
    if (!ctx) return;

    const now = ctx.currentTime;
    const variation = 0.95 + Math.random() * 0.1;

    const master = ctx.createGain();
    master.gain.setValueAtTime(
      BASE_GAIN * getUiSoundVolume() * variation,
      now,
    );

    connectOutput(ctx, master);
    scheduleMarimbaPluck(ctx, master, staggerTickFrequencyHz(index), now, variation);
  } catch {
    // Never break rendering if Web Audio fails.
  }
}
