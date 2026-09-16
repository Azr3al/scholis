"use client";

import LiteYouTubeEmbed from "react-lite-youtube-embed";
import "react-lite-youtube-embed/dist/LiteYouTubeEmbed.css";

export function YouTubeRecordingPlayer({
  videoId,
  title = "Recording",
}: {
  videoId: string;
  title?: string;
}) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black [&_.lty-playbtn]:!border-white/80">
      <LiteYouTubeEmbed
        id={videoId}
        title={title}
        poster="hqdefault"
        wrapperClass="yt-lite w-full h-full"
      />
    </div>
  );
}
