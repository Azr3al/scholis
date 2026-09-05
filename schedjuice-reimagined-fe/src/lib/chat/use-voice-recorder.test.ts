import { describe, expect, it } from "vitest";

import {
  MIN_VOICE_RECORDING_MS,
  pickSupportedVoiceRecorderMime,
  shouldSendVoiceRecording,
  voiceDragStatusFromPan,
  VOICE_CANCEL_DRAG_THRESHOLD_PX,
} from "@/lib/chat/use-voice-recorder";

describe("pickSupportedVoiceRecorderMime", () => {

  it("prefers webm when both codecs are supported", () => {
    if (typeof MediaRecorder === "undefined") return;

    const original = globalThis.MediaRecorder;
    globalThis.MediaRecorder = class MockMediaRecorder {
      static isTypeSupported(type: string) {
        return type === "audio/webm;codecs=opus" || type === "audio/mp4";
      }
    } as unknown as typeof MediaRecorder;

    expect(pickSupportedVoiceRecorderMime()?.ext).toBe(".webm");

    globalThis.MediaRecorder = original;
  });

  it("falls back to mp4 when webm is unsupported", () => {
    if (typeof MediaRecorder === "undefined") return;

    const original = globalThis.MediaRecorder;
    globalThis.MediaRecorder = class MockMediaRecorder {
      static isTypeSupported(type: string) {
        return type === "audio/mp4";
      }
    } as unknown as typeof MediaRecorder;

    expect(pickSupportedVoiceRecorderMime()?.ext).toBe(".m4a");

    globalThis.MediaRecorder = original;
  });
});

describe("shouldSendVoiceRecording", () => {
  it("rejects short, cancelled, or non-send stops", () => {
    expect(
      shouldSendVoiceRecording({
        send: true,
        durationMs: MIN_VOICE_RECORDING_MS - 1,
      })
    ).toBe(false);
    expect(
      shouldSendVoiceRecording({
        send: true,
        durationMs: 1000,
        isCancelling: true,
      })
    ).toBe(false);
    expect(shouldSendVoiceRecording({ send: false, durationMs: 1000 })).toBe(
      false
    );
  });

  it("accepts long enough recordings", () => {
    expect(
      shouldSendVoiceRecording({
        send: true,
        durationMs: MIN_VOICE_RECORDING_MS,
      })
    ).toBe(true);
  });
});

describe("voiceDragStatusFromPan", () => {
  it("enters and exits cancelling based on horizontal drag", () => {
    expect(
      voiceDragStatusFromPan(
        "recording",
        -(VOICE_CANCEL_DRAG_THRESHOLD_PX + 1)
      )
    ).toBe("cancelling");
    expect(voiceDragStatusFromPan("cancelling", 0)).toBe("recording");
  });
});
