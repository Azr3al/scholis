import type { HandleId } from "./hit-test";

export const SNAP_SCREEN_PX = 6;

export type SnapRect = { x: number; y: number; width: number; height: number };
export type SnapTargets = { xs: number[]; ys: number[] };
export type SnapGuides = { xs: number[]; ys: number[] };
export type SnapResult<T extends SnapRect> = { rect: T; guides: SnapGuides };

type AxisHit = { delta: number; target: number };

function edges(rect: SnapRect) {
  return {
    left: rect.x,
    cx: rect.x + rect.width / 2,
    right: rect.x + rect.width,
    top: rect.y,
    cy: rect.y + rect.height / 2,
    bottom: rect.y + rect.height,
  };
}

function closestHit(values: number[], targets: number[], threshold: number): AxisHit | null {
  let best: AxisHit | null = null;
  for (const value of values) {
    for (const target of targets) {
      const delta = target - value;
      const distance = Math.abs(delta);
      if (distance > threshold) continue;
      if (!best || distance < Math.abs(best.delta)) {
        best = { delta, target };
      }
    }
  }
  return best;
}

export function pageSnapTargets(page: { width: number; height: number }): SnapTargets {
  if (page.width <= 0 || page.height <= 0) return { xs: [], ys: [] };
  return {
    xs: [0, page.width / 2, page.width],
    ys: [0, page.height / 2, page.height],
  };
}

export function siblingSnapTargets(
  layers: Array<SnapRect & { id: string }>,
  excludeId: string,
): SnapTargets {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const layer of layers) {
    if (layer.id === excludeId) continue;
    const box = edges(layer);
    xs.push(box.left, box.cx, box.right);
    ys.push(box.top, box.cy, box.bottom);
  }
  return { xs, ys };
}

export function mergeSnapTargets(...groups: SnapTargets[]): SnapTargets {
  return {
    xs: groups.flatMap((group) => group.xs),
    ys: groups.flatMap((group) => group.ys),
  };
}

export function snapMove<T extends SnapRect>(
  rect: T,
  targets: SnapTargets,
  threshold: number,
): SnapResult<T> {
  const box = edges(rect);
  const xHit = closestHit([box.left, box.cx, box.right], targets.xs, threshold);
  const yHit = closestHit([box.top, box.cy, box.bottom], targets.ys, threshold);
  return {
    rect: {
      ...rect,
      x: rect.x + (xHit?.delta ?? 0),
      y: rect.y + (yHit?.delta ?? 0),
    },
    guides: {
      xs: xHit ? [xHit.target] : [],
      ys: yHit ? [yHit.target] : [],
    },
  };
}

export function snapResize<T extends SnapRect>(
  rect: T,
  handle: HandleId,
  targets: SnapTargets,
  threshold: number,
): SnapResult<T> {
  const box = edges(rect);
  const xEdges: number[] = [];
  const yEdges: number[] = [];
  if (handle.includes("e")) xEdges.push(box.right);
  if (handle.includes("w")) xEdges.push(box.left);
  if (handle.includes("n")) yEdges.push(box.top);
  if (handle.includes("s")) yEdges.push(box.bottom);

  const xHit = closestHit(xEdges, targets.xs, threshold);
  const yHit = closestHit(yEdges, targets.ys, threshold);

  let { x, y, width, height } = rect;
  if (xHit) {
    if (handle.includes("e")) width = xHit.target - x;
    if (handle.includes("w")) {
      width = box.right - xHit.target;
      x = xHit.target;
    }
  }
  if (yHit) {
    if (handle.includes("s")) height = yHit.target - y;
    if (handle.includes("n")) {
      height = box.bottom - yHit.target;
      y = yHit.target;
    }
  }

  return {
    rect: { ...rect, x, y, width, height },
    guides: {
      xs: xHit ? [xHit.target] : [],
      ys: yHit ? [yHit.target] : [],
    },
  };
}
