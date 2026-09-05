import { describe, expect, it } from "vitest";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { playbackFromUserRecording } from "@/components/media/recording-playback-types";

describe("extractYouTubeVideoId", () => {
  it("parses watch URLs", () => {
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    ).toBe("dQw4w9WgXcQ");
  });

  it("parses short URLs", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("returns null for invalid URLs", () => {
    expect(extractYouTubeVideoId("https://example.com")).toBeNull();
  });
});

describe("playbackFromUserRecording", () => {
  it("prefers API playback payload", () => {
    expect(
      playbackFromUserRecording({
        playback: { kind: "youtube", videoId: "abc12345678", url: null },
      })
    ).toEqual({ kind: "youtube", videoId: "abc12345678", url: null });
  });

  it("normalizes snake_case video_id from API playback", () => {
    expect(
      playbackFromUserRecording({
        playback: {
          kind: "youtube",
          video_id: "dQw4w9WgXcQ",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
      })
    ).toEqual({
      kind: "youtube",
      videoId: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("builds youtube playback from fields", () => {
    expect(
      playbackFromUserRecording({
        source_type: "youtube",
        youtube_video_id: "dQw4w9WgXcQ",
        youtube_url: "https://youtu.be/dQw4w9WgXcQ",
      })
    ).toEqual({
      kind: "youtube",
      videoId: "dQw4w9WgXcQ",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
  });

  it("builds file playback from download_url", () => {
    expect(
      playbackFromUserRecording({
        source_type: "file",
        download_url: "https://cdn.example.com/video.mp4",
      })
    ).toEqual({
      kind: "file",
      url: "https://cdn.example.com/video.mp4",
    });
  });
});
