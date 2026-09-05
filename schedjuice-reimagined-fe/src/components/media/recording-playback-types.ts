export type FilePlaybackSource = {
  kind: "file";
  url: string | null;
};

export type YouTubePlaybackSource = {
  kind: "youtube";
  videoId: string;
  url?: string | null;
};

export type RecordingPlaybackSource = FilePlaybackSource | YouTubePlaybackSource;

export function filePlaybackSource(url: string | null): FilePlaybackSource {
  return { kind: "file", url };
}

export function youTubePlaybackSource(
  videoId: string,
  url?: string | null
): YouTubePlaybackSource {
  return { kind: "youtube", videoId, url };
}

/** API playback uses snake_case (`video_id`); the player uses camelCase (`videoId`). */
type ApiPlaybackPayload = {
  kind?: string;
  video_id?: string | null;
  videoId?: string | null;
  url?: string | null;
};

function normalizeApiPlayback(
  playback: ApiPlaybackPayload
): RecordingPlaybackSource | null {
  if (playback.kind === "youtube") {
    const videoId = playback.videoId ?? playback.video_id ?? "";
    if (!videoId) return null;
    return youTubePlaybackSource(videoId, playback.url);
  }

  if (playback.kind === "file") {
    return filePlaybackSource(playback.url ?? null);
  }

  return null;
}

export function playbackFromUserRecording(recording: {
  source_type?: string;
  youtube_video_id?: string | null;
  youtube_url?: string | null;
  download_url?: string | null;
  playback?: RecordingPlaybackSource | ApiPlaybackPayload | null;
}): RecordingPlaybackSource | null {
  if (recording.playback) {
    const normalized = normalizeApiPlayback(recording.playback);
    if (normalized) return normalized;
  }

  if (recording.source_type === "youtube" && recording.youtube_video_id) {
    return youTubePlaybackSource(recording.youtube_video_id, recording.youtube_url);
  }

  if (recording.download_url) {
    return filePlaybackSource(recording.download_url);
  }

  return null;
}
