"use client";

import { useRef, useState, type ReactNode } from "react";

const MAX_TILT = 12;
const PERSPECTIVE = 800;

type TiltCardProps = {
  children: ReactNode;
  className?: string;
};

export function TiltCard({ children, className }: TiltCardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = wrapRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setTilt({
      rotateY: (x - 0.5) * 2 * MAX_TILT,
      rotateX: -(y - 0.5) * 2 * MAX_TILT,
    });
    setGlare({
      x: x * 100,
      y: y * 100,
      opacity: 0.35,
    });
  }

  function handlePointerLeave() {
    setTilt({ rotateX: 0, rotateY: 0 });
    setGlare((g) => ({ ...g, opacity: 0 }));
  }

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ perspective: `${PERSPECTIVE}px` }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div
        className="relative transition-transform duration-200 ease-out will-change-transform"
        style={{
          transform: `rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        {children}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[2rem] transition-opacity duration-200"
          style={{
            opacity: glare.opacity,
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.45) 0%, transparent 55%)`,
          }}
        />
      </div>
    </div>
  );
}
