import { useEffect, useState, useRef } from "react";
import { generatePattern } from "@/helpers/generate-pattern";

interface RandomPatternImageProps {
  seed: number;
  height?: number;
}

export function RandomPatternImage({ seed }: RandomPatternImageProps) {
  const [patternDataUrl, setPatternDataUrl] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const paint = () => {
      // +4px bleed so scaled bitmap never leaves subpixel gaps at card edges on narrow viewports.
      const containerWidth = Math.max(1, Math.ceil((el.offsetWidth || 320) + 4));
      const pattern = generatePattern(containerWidth, 100, 20, seed);
      if (pattern) {
        setPatternDataUrl(pattern);
      }
    };

    paint();

    const ro = new ResizeObserver(() => paint());
    ro.observe(el);
    window.addEventListener("resize", paint);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", paint);
    };
  }, [seed]);

  return (
    <div
      ref={containerRef}
      className="w-full min-w-0 overflow-hidden rounded-t-xl"
    >
      {patternDataUrl ? (
        <img
          className="block h-[88px] w-full min-w-full max-w-none object-cover object-center opacity-95"
          src={patternDataUrl}
          alt=""
        />
      ) : (
        <p>Failed to generate pattern.</p>
      )}
    </div>
  );
}
