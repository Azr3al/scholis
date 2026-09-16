// src/components/primitives/decoration/rough-frame.tsx
"use client";

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import rough from "roughjs";
import { cn } from "@/lib/utils";

/** Wraps children in a hand-drawn rectangle that tracks the content box. */
export function RoughFrame({ children, className }: { children: ReactNode; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const seed = useMemo(() => Math.floor(Math.random() * 2 ** 31), []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (!wrap || !svg) return;
    const draw = () => {
      const { width: w, height: h } = wrap.getBoundingClientRect();
      svg.replaceChildren();
      const rc = rough.svg(svg);
      svg.appendChild(
        rc.rectangle(3, 3, Math.max(w - 6, 1), Math.max(h - 6, 1), {
          seed, strokeWidth: 1.6, roughness: 1.5, stroke: "currentColor",
        }),
      );
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [seed]);

  return (
    <div ref={wrapRef} className={cn("relative text-border-strong", className)}>
      <svg ref={svgRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      <div className="relative">{children}</div>
    </div>
  );
}
