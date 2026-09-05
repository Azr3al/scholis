// src/components/primitives/decoration/paper-grain.tsx
import { cn } from "@/lib/utils";

/**
 * Subtle paper-grain overlay (DESIGN.md §8). Inline SVG turbulence; fill follows --text-primary
 * so the grain flips with ink in dark mode. Fixed, non-interactive, ~5.5% opacity.
 */
export function PaperGrain({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 z-0 opacity-[0.055]", className)}
    >
      <svg className="size-full" xmlns="http://www.w3.org/2000/svg">
        <filter id="sj-paper-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves={2}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect
          width="100%"
          height="100%"
          filter="url(#sj-paper-grain)"
          fill="var(--text-primary)"
        />
      </svg>
    </div>
  );
}
