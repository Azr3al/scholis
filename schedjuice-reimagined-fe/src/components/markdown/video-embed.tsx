export function VideoEmbed({ src, title }: { src: string; title?: string }) {
  return (
    <div className="relative my-6 aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
      <video
        src={src}
        title={title ?? "Video"}
        className="absolute inset-0 h-full w-full"
        controls
        playsInline
        preload="metadata"
      />
    </div>
  );
}
