// src/components/primitives/decoration/ink-bleed.tsx

/**
 * Shared SVG filter definitions for the ink-bleed texture (DESIGN.md §8).
 *
 * Both filters are static: `feTurbulence` generates the noise field once and
 * `feDisplacementMap` pushes the source geometry through it. Nothing here
 * animates — callers animate a plain `transform: scale()` on the shape being
 * filtered, so the ragged edge grows without re-running the turbulence pass
 * on every frame.
 *
 * Mount once per surface that uses `.sj-ink-act`, `.sj-ink-dot`, or the seal.
 */
export function InkBleedDefs() {
  return (
    <svg
      aria-hidden
      focusable="false"
      className="pointer-events-none absolute size-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Coarse: page-scale washes and the seal blot. */}
        <filter id="sj-ink-bleed" x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.02"
            numOctaves={4}
            seed={7}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={46}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Fine: control-scale bleed and settled dots. */}
        <filter id="sj-ink-bleed-sm" x="-60%" y="-60%" width="220%" height="220%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.07"
            numOctaves={4}
            seed={3}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={9}
            xChannelSelector="R"
            yChannelSelector="G"
          />
          <feGaussianBlur stdDeviation={0.35} />
        </filter>
      </defs>
    </svg>
  );
}
