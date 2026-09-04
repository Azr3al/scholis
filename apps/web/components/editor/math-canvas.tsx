'use client';

import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from 'react';

/**
 * Draw an equation by hand.
 *
 * The other half of "maths editor": LaTeX covers anything typeable, this covers
 * the diagram, the working-out, and the notation nobody wants to look up. It
 * exports a PNG and goes through the same upload path as any other image, so
 * there is no third storage concept — a drawing *is* an image.
 *
 * Pointer events rather than mouse: the same handlers then work with a stylus
 * or a finger, which is how anyone would actually draw a formula.
 */
export const MathCanvas = ({
  onInsert,
  onCancel,
}: {
  onInsert: (png: Blob) => void;
  onCancel: () => void;
}) => {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;

    // A white background, not transparency. A transparent PNG becomes invisible
    // black-on-black the moment the page is in dark mode.
    const context = element.getContext('2d');
    if (context === null) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, element.width, element.height);
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#111111';
  }, []);

  const positionOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const element = event.currentTarget;
    const box = element.getBoundingClientRect();
    // The canvas is displayed smaller than its backing store, so screen
    // coordinates have to be scaled or the line lands away from the pointer.
    return {
      x: ((event.clientX - box.left) / box.width) * element.width,
      y: ((event.clientY - box.top) / box.height) * element.height,
    };
  };

  const context = () => canvas.current?.getContext('2d') ?? null;

  return (
    <div className="grid gap-2 rounded-md border p-3" data-testid="math-canvas">
      <p className="text-xs text-muted-foreground">
        Draw the equation. It is inserted as an image.
      </p>

      <canvas
        ref={canvas}
        width={800}
        height={300}
        className="w-full cursor-crosshair touch-none rounded-md border bg-white"
        onPointerDown={(event) => {
          const ctx = context();
          if (ctx === null) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          const { x, y } = positionOf(event);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(event) => {
          const ctx = context();
          if (ctx === null || !drawing.current) return;
          const { x, y } = positionOf(event);
          ctx.lineTo(x, y);
          ctx.stroke();
          if (!dirty) setDirty(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerLeave={() => {
          drawing.current = false;
        }}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!dirty}
          data-testid="insert-drawing-confirm"
          onClick={() => {
            canvas.current?.toBlob((blob) => {
              if (blob !== null) onInsert(blob);
            }, 'image/png');
          }}
        >
          Insert
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const element = canvas.current;
            const ctx = context();
            if (element === null || ctx === null) return;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, element.width, element.height);
            ctx.strokeStyle = '#111111';
            setDirty(false);
          }}
        >
          Clear
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
