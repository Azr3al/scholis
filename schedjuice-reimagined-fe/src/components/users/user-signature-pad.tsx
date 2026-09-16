"use client";

import SignaturePad from "signature_pad";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type UserSignaturePadHandle = {
  isEmpty: () => boolean;
  clear: () => void;
  toPngDataUrl: () => string;
};

type UserSignaturePadProps = {
  className?: string;
  onStrokeEnd?: () => void;
};

export const UserSignaturePad = forwardRef<
  UserSignaturePadHandle,
  UserSignaturePadProps
>(function UserSignaturePad({ className, onStrokeEnd }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const onStrokeEndRef = useRef(onStrokeEnd);

  useEffect(() => {
    onStrokeEndRef.current = onStrokeEnd;
  }, [onStrokeEnd]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      ctx?.scale(ratio, ratio);
      padRef.current?.clear();
    };

    const pad = new SignaturePad(canvas, {
      penColor: "#000000",
      backgroundColor: "rgba(0,0,0,0)",
      minWidth: 0.8,
      maxWidth: 2.4,
    });
    pad.addEventListener("endStroke", () => onStrokeEndRef.current?.());
    padRef.current = pad;

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      padRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    clear: () => padRef.current?.clear(),
    toPngDataUrl: () => padRef.current?.toDataURL("image/png") ?? "",
  }));

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label="Signature drawing area"
    />
  );
});
