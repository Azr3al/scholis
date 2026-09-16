import { getSharedAudioContext } from "./audio-context";
import { getUiSoundVolume, isUiSoundEnabled } from "./sound-preference";

/** Base synthesis gain before user volume scaling (~3.3× original 0.06 default). */
const BASE_GAIN = 0.20;

/**
 * Play a subtle, varied mechanical "brown switch" click.
 * Synthesized via Web Audio — no asset files.
 */
export function playClick(): void {
  if (typeof window === "undefined" || !isUiSoundEnabled()) return;

  try {
    const ctx = getSharedAudioContext();
    const now = ctx.currentTime;
    const variation = 0.85 + Math.random() * 0.3;

    const master = ctx.createGain();
    master.gain.setValueAtTime(
      BASE_GAIN * getUiSoundVolume() * variation,
      now,
    );

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime((Math.random() - 0.5) * 0.4, now);
    master.connect(panner);
    panner.connect(ctx.destination);

    // Low sine "body" — muted tactile thock (~150–210 Hz).
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = "sine";
    bodyOsc.frequency.setValueAtTime(150 + Math.random() * 60, now);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.5 * variation, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(master);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.035);

    // Short band-passed noise transient (~6–10 ms).
    const noiseDuration = 0.006 + Math.random() * 0.004;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * noiseDuration));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(800 + Math.random() * 400, now);
    bandpass.Q.setValueAtTime(1.2, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25 * variation, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDuration);

    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(now);
    noise.stop(now + noiseDuration + 0.002);
  } catch {
    // Never break navigation if Web Audio fails.
  }
}
