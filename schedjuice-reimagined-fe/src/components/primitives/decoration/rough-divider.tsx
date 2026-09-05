// src/components/primitives/decoration/rough-divider.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import rough from "roughjs";
import { cn } from "@/lib/utils";

/** Hand-drawn horizontal divider; prefer over <hr> (DESIGN.md §8, banned §14 #14). */
export function RoughDivider({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const seed = useMemo(() => Math.floor(Math.random() * 2 ** 31), []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const draw = () => {
      const w = svg.clientWidth || 240;
      svg.replaceChildren();
      const rc = rough.svg(svg);
      svg.appendChild(
        rc.line(2, 5, w - 2, 6, { seed, strokeWidth: 1.5, roughness: 1.6, stroke: "currentColor" }),
      );
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [seed]);

  return (
    <svg ref={svgRef} role="separator" aria-orientation="horizontal" height={11}
      className={cn("block w-full text-border-strong", className)} />
  );
}
