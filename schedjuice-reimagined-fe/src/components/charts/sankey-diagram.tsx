"use client";

import { sankey, sankeyLeft, sankeyLinkHorizontal } from "d3-sankey";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type SankeyNodeInput = {
  key: string;
  label: string;
  amount: string;
  isEstimated?: boolean;
};

export type SankeyLinkInput = {
  source: string;
  target: string;
  amount: string;
  isEstimated?: boolean;
};

export type SankeyDiagramProps = {
  nodes: SankeyNodeInput[];
  links: SankeyLinkInput[];
  formatAmount: (amount: string) => string;
  nodeColor: (node: SankeyNodeInput) => string;
  emptyMessage?: string;
  tooltipContent?: (args: {
    kind: "node" | "link";
    node?: SankeyNodeInput;
    link?: SankeyLinkInput;
  }) => ReactNode;
};

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 320;
const DEFAULT_EMPTY = "No billed fees for this period.";

type LayoutNode = SankeyNodeInput & {
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
};

type LayoutLink = {
  source: LayoutNode | string;
  target: LayoutNode | string;
  value: number;
  amount: string;
  isEstimated?: boolean;
  width?: number;
  y0?: number;
  y1?: number;
};

const LINK_LABEL_MIN_THICKNESS = 16;
const LINK_LABEL_CHAR_PX = 6.2;
const LINK_LABEL_PAD = 16;

export function sankeyLinkLabelFits(
  thickness: number,
  span: number,
  label: string,
): boolean {
  if (thickness < LINK_LABEL_MIN_THICKNESS) return false;
  return span >= label.length * LINK_LABEL_CHAR_PX + LINK_LABEL_PAD;
}

function nodeInput(node: LayoutNode | string, byKey: Map<string, SankeyNodeInput>): SankeyNodeInput | undefined {
  if (typeof node === "string") return byKey.get(node);
  return node;
}

export function SankeyDiagram({
  nodes,
  links,
  formatAmount,
  nodeColor,
  emptyMessage = DEFAULT_EMPTY,
  tooltipContent,
}: SankeyDiagramProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: ReactNode;
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(entry.contentRect.width, 640);
      setSize({ width, height: DEFAULT_HEIGHT });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graph = useMemo(() => {
    if (!links.length) return null;
    const layout = sankey<LayoutNode, LayoutLink>()
      .nodeId((d) => d.key)
      .nodeAlign(sankeyLeft)
      .nodeWidth(18)
      .nodePadding(24)
      .extent([
        [96, 16],
        [size.width - 120, size.height - 16],
      ]);
    return layout({
      nodes: nodes.map((node) => ({ ...node })),
      links: links.map((link) => ({
        source: link.source,
        target: link.target,
        value: Number(link.amount) || 0,
        amount: link.amount,
        isEstimated: link.isEstimated,
      })),
    });
  }, [nodes, links, size.width, size.height]);

  const byKey = useMemo(
    () => new Map(nodes.map((node) => [node.key, node])),
    [nodes],
  );

  if (!links.length) {
    return (
      <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const path = sankeyLinkHorizontal<LayoutNode, LayoutLink>();
  const minX = Math.min(
    ...(graph?.nodes.map((node) => node.x0 ?? 0) ?? [0]),
  );

  return (
    <div ref={wrapRef} className="relative min-h-[280px] w-full overflow-x-auto">
      <svg
        width={size.width}
        height={size.height}
        className="min-w-[640px]"
        role="img"
      >
        <defs>
          <pattern
            id="sankey-hatch"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.55"
            />
          </pattern>
        </defs>
        {graph?.links.map((link, index) => {
          const source = nodeInput(link.source, byKey);
          const target = nodeInput(link.target, byKey);
          const color = source ? nodeColor(source) : "currentColor";
          const original: SankeyLinkInput = {
            source: source?.key ?? "",
            target: target?.key ?? "",
            amount: link.amount,
            isEstimated: link.isEstimated,
          };
          const sourceNode = typeof link.source === "string" ? undefined : link.source;
          const targetNode = typeof link.target === "string" ? undefined : link.target;
          const label = formatAmount(link.amount);
          const span =
            sourceNode && targetNode
              ? (targetNode.x0 ?? 0) - (sourceNode.x1 ?? 0)
              : 0;
          const showLabel = sankeyLinkLabelFits(
            link.width ?? 0,
            span,
            label,
          );
          const midX =
            sourceNode && targetNode
              ? ((sourceNode.x1 ?? 0) + (targetNode.x0 ?? 0)) / 2
              : 0;
          const midY = ((link.y0 ?? 0) + (link.y1 ?? 0)) / 2;
          return (
            <g key={`${original.source}-${original.target}-${index}`}>
              <path
                d={path(link) ?? undefined}
                fill="none"
                stroke={color}
                strokeOpacity={0.45}
                strokeWidth={Math.max(1, link.width ?? 1)}
                onPointerEnter={(event) => {
                  const content = tooltipContent
                    ? tooltipContent({ kind: "link", link: original })
                    : `${source?.label ?? original.source} → ${target?.label ?? original.target}: ${label}`;
                  setTooltip({ x: event.clientX, y: event.clientY, content });
                }}
                onPointerLeave={() => setTooltip(null)}
              />
              {link.isEstimated ? (
                <path
                  d={path(link) ?? undefined}
                  fill="none"
                  stroke="url(#sankey-hatch)"
                  strokeOpacity={0.7}
                  strokeWidth={Math.max(1, link.width ?? 1)}
                  pointerEvents="none"
                />
              ) : null}
              {showLabel ? (
                <text
                  x={midX}
                  y={midY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                  className="text-[10px] font-medium"
                  fill="currentColor"
                  stroke="var(--background)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  data-link-label={`${original.source}-${original.target}`}
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
        {graph?.nodes.map((node) => {
          const x = node.x0 ?? 0;
          const y = node.y0 ?? 0;
          const width = (node.x1 ?? 0) - x;
          const height = Math.max((node.y1 ?? 0) - y, 1);
          const color = nodeColor(node);
          const estimated = Boolean(node.isEstimated);
          const aria = estimated ? `${node.label} (estimated)` : node.label;
          const isFirstColumn = Math.abs((node.x0 ?? 0) - minX) < 1;
          const labelOnRight = !isFirstColumn;
          return (
            <g
              key={node.key}
              data-node-key={node.key}
              fill={color}
              aria-label={aria}
              onPointerEnter={(event) => {
                const content = tooltipContent
                  ? tooltipContent({ kind: "node", node })
                  : `${node.label}: ${formatAmount(node.amount)}`;
                setTooltip({ x: event.clientX, y: event.clientY, content });
              }}
              onPointerLeave={() => setTooltip(null)}
            >
              <rect x={x} y={y} width={width} height={height} />
              {estimated ? (
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="url(#sankey-hatch)"
                  opacity={0.45}
                />
              ) : null}
              <text
                x={labelOnRight ? x + width + 8 : x - 8}
                y={y + height / 2}
                dominantBaseline="middle"
                textAnchor={labelOnRight ? "start" : "end"}
                className="fill-foreground text-[11px]"
                fill="currentColor"
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{ left: 12, top: 12 }}
        >
          {tooltip.content}
        </div>
      ) : null}
    </div>
  );
}
