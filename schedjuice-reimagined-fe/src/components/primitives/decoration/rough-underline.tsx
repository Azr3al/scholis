// src/components/primitives/decoration/rough-underline.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import rough from "roughjs";
import { cn } from "@/lib/utils";

export function RoughUnderline({
  className,
  strokeWidth = 2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const seed = useMemo(() => Math.floor(Math.random() * 2 ** 31), []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const draw = () => {
      const w = svg.clientWidth || 120;
      svg.replaceChildren();
      const rc = rough.svg(svg);
      svg.appendChild(
        rc.line(2, 6, w - 2, 5, { seed, strokeWidth, roughness: 1.4, stroke: "currentColor" }),
      );
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [seed, strokeWidth]);

  return (
    <svg
      ref={svgRef}
      aria-hidden
      height={10}
      className={cn("block w-full text-brand", className)}
    />
  );
}
