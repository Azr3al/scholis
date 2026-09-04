'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Small generated cues for the take flow — a tone, and a tap where the device
 * can manage one.
 *
 * Oscillators rather than audio files: three short tones do not justify a
 * network request, a cache entry, or something else to break offline. It also
 * means no decoding delay, which matters when the point of a cue is that it
 * lands with the action.
 *
 * Two rules the browser imposes and one we impose:
 *
 *  - An AudioContext created before a user gesture starts suspended, so it is
 *    created lazily on the first cue and resumed if it was suspended.
 *  - Autoplay policy means a cue before any interaction is silently dropped.
 *    Fine: there is nothing to acknowledge before the student has done
 *    something.
 *  - Anyone who has asked for reduced motion is asking for less, so cues stay
 *    off for them too — vibration included, since a buzzing phone is motion in
 *    the way that matters to someone who asked for less of it.
 *
 * Every failure path is a no-op. Feedback is decoration, and a browser refusing
 * to make a sound or a tap must never interfere with answering a question.
 */
export type UiCue = 'navigate' | 'saved' | 'alert';

const TONES: Record<UiCue, { frequency: number; durationMs: number; gain: number }> = {
  // Low and very short — this one fires most often.
  navigate: { frequency: 440, durationMs: 55, gain: 0.02 },
  // A touch higher, to read as completion rather than movement.
  saved: { frequency: 660, durationMs: 80, gain: 0.025 },
  // The only one anyone should notice.
  alert: { frequency: 320, durationMs: 160, gain: 0.04 },
};

/**
 * Milliseconds, and a pattern for the one cue worth interrupting someone for.
 *
 * Deliberately shorter than feels right when read as a number: a 10ms tick is
 * a tap, and anything past about 30ms starts to read as a buzz. Support is
 * Android-only in practice — iOS Safari has never implemented `vibrate`, so on
 * an iPhone the tone is the whole cue. That's why the tones weren't replaced by
 * haptics, only joined by them.
 */
const PATTERNS: Record<UiCue, number | number[]> = {
  navigate: 10,
  saved: 15,
  alert: [30, 40, 30],
};

export const useUiFeedback = (): ((cue: UiCue) => void) => {
  const contextRef = useRef<AudioContext | null>(null);
  const allowed = useRef(true);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    allowed.current = !reduced.matches;

    const onChange = (event: MediaQueryListEvent) => {
      allowed.current = !event.matches;
    };
    reduced.addEventListener('change', onChange);

    return () => {
      reduced.removeEventListener('change', onChange);
      void contextRef.current?.close().catch(() => undefined);
      contextRef.current = null;
    };
  }, []);

  return useCallback((cue: UiCue) => {
    if (!allowed.current) return;

    try {
      // Its own try: a device that refuses to vibrate must not cost us the
      // tone, and a browser with no AudioContext must not cost us the tap.
      if ('vibrate' in navigator) navigator.vibrate(PATTERNS[cue]);
    } catch {
      // Blocked by the browser, or no motor. Nothing to do about either.
    }

    try {
      contextRef.current ??= new AudioContext();
      const context = contextRef.current;

      // Created before a gesture, or suspended by the browser after one. Either
      // way resume() is the documented way back, and if it rejects we simply
      // make no sound.
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      if (context.state !== 'running') return;

      const { frequency, durationMs, gain } = TONES[cue];
      const now = context.currentTime;
      const duration = durationMs / 1000;

      const oscillator = context.createOscillator();
      const envelope = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      // Ramped rather than switched. A square-edged gain change is an audible
      // click, which is worse than the cue it is trying to deliver.
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(gain, now + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(envelope);
      envelope.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {
      // No AudioContext, blocked, or out of hardware voices. Never the
      // student's problem.
    }
  }, []);
};
