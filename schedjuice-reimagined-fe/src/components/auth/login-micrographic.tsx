"use client";

import { cn } from "@/lib/utils";

export type LoginMicrographicProps = {
  tenantName: string;
  className?: string;
};

function truncateTenant(name: string, max = 28): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function LoginMicrographicCompact({
  tenantName,
  className,
}: {
  tenantName: string;
  className?: string;
}) {
  const tenant = truncateTenant(tenantName, 22);
  return (
    <div
      aria-hidden
      className={cn(
        "flex w-full max-w-[18rem] items-center gap-2 rounded-sm border border-border/40 px-2 py-1.5 text-muted-foreground/60 md:hidden",
        className,
      )}
    >
      <svg
        viewBox="0 0 120 20"
        className="h-5 w-[7.5rem] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden
      >
        <circle cx="4" cy="10" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none" />
        <text x="13" y="11.5" fontSize="6" fontFamily="ui-monospace, monospace">
          ×
        </text>
        <circle cx="22" cy="10" r="1.5" stroke="currentColor" fill="none" />
        <circle cx="28" cy="10" r="1.5" stroke="currentColor" fill="none" />
        <line x1="34" y1="10" x2="38" y2="10" />
        <line x1="44" y1="6" x2="44" y2="14" />
        <line x1="40" y1="10" x2="48" y2="10" />
        <text x="42" y="8.5" fontSize="5" fontFamily="ui-monospace, monospace">
          ×
        </text>
        <circle cx="56" cy="10" r="2" stroke="currentColor" fill="none" />
        <path d="M58 10 H64 V6 H74" />
        <circle cx="74" cy="6" r="2" stroke="currentColor" fill="none" />
        <circle cx="86" cy="10" r="1" fill="currentColor" stroke="none" />
        <line x1="88" y1="10" x2="96" y2="10" />
        <circle cx="98" cy="10" r="1" fill="currentColor" stroke="none" />
      </svg>
      <p className="min-w-0 truncate font-mono text-[10px] leading-none">
        Mon · Yangon · {tenant}
      </p>
    </div>
  );
}

function LoginMicrographicPanel({
  tenantName,
  className,
}: {
  tenantName: string;
  className?: string;
}) {
  const tenant = truncateTenant(tenantName);
  return (
    <div
      aria-hidden
      className={cn(
        "hidden w-full max-w-[24rem] rounded-sm border border-border/40 px-3 py-2.5 text-muted-foreground/60 md:block",
        className,
      )}
    >
      <svg
        viewBox="0 0 384 56"
        className="h-14 w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden
      >
        <text x="0" y="8" fontSize="7" fontFamily="ui-monospace, monospace">
          Mon · Wk 12
        </text>
        <text
          x="384"
          y="8"
          fontSize="7"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
        >
          3 sessions
        </text>

        {[0, 1, 2, 3].map((row) =>
          [0, 1, 2, 3].map((col) => {
            const x = col * 6;
            const y = 14 + row * 6;
            const filled =
              (row === 0 && col < 2) || (row === 1 && col === 1);
            const cross = row === 0 && col === 2;
            if (cross) {
              return (
                <text
                  key={`${row}-${col}`}
                  x={x + 1}
                  y={y + 4}
                  fontSize="6"
                  fontFamily="ui-monospace, monospace"
                >
                  ×
                </text>
              );
            }
            return (
              <circle
                key={`${row}-${col}`}
                cx={x + 2}
                cy={y + 2}
                r="1.5"
                fill={filled ? "currentColor" : "none"}
                stroke="currentColor"
              />
            );
          }),
        )}

        <path d="M52 28 A10 10 0 0 1 72 28" />
        <text x="58" y="26" fontSize="7" fontFamily="ui-monospace, monospace">
          88%
        </text>

        <circle cx="100" cy="22" r="3" stroke="currentColor" fill="none" />
        <path d="M103 22 H115 V32 H130" />
        <circle cx="130" cy="32" r="3" stroke="currentColor" fill="none" />
        <circle cx="115" cy="38" r="3" fill="currentColor" stroke="currentColor" />
        <path d="M115 35 V32" />
        <circle cx="100" cy="32" r="2" stroke="currentColor" fill="none" />
        <path d="M102 32 H108" />

        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <g
              key={`cross-${r}-${c}`}
              transform={`translate(${150 + c * 8}, ${16 + r * 8})`}
            >
              <line x1="2" y1="0" x2="2" y2="4" />
              <line x1="0" y1="2" x2="4" y2="2" />
            </g>
          )),
        )}
        <text x="158" y="20" fontSize="5" fontFamily="ui-monospace, monospace">
          ×
        </text>

        <line x1="180" y1="44" x2="280" y2="44" />
        <circle cx="190" cy="44" r="2" fill="currentColor" stroke="none" />
        <circle cx="230" cy="44" r="2" fill="currentColor" stroke="none" />
        <circle cx="270" cy="44" r="2" fill="currentColor" stroke="none" />
        <path d="M230 44 V36 H250 V48 H270" />
        <path d="M210 44 L220 34 L225 44" />
        <path d="M255 44 L265 50 L275 44" />

        <text x="178" y="34" fontSize="7" fontFamily="ui-monospace, monospace">
          08:30
        </text>
        <text x="248" y="52" fontSize="7" fontFamily="ui-monospace, monospace">
          Room 214
        </text>

        <circle cx="300" cy="24" r="8" stroke="currentColor" fill="none" />
        <line x1="300" y1="16" x2="300" y2="32" />
        <line x1="292" y1="24" x2="308" y2="24" />
        <circle cx="320" cy="24" r="2" stroke="currentColor" fill="none" />
        <line x1="322" y1="24" x2="340" y2="24" />
        <circle cx="342" cy="24" r="2" stroke="currentColor" fill="none" />
        <line x1="344" y1="24" x2="360" y2="16" />
        <circle cx="362" cy="16" r="2" stroke="currentColor" fill="none" />
      </svg>
      <p className="mt-1 truncate font-mono text-[10px] leading-none">
        Ready · Yangon · {tenant}
      </p>
    </div>
  );
}

export function LoginMicrographic({
  tenantName,
  className,
}: LoginMicrographicProps) {
  return (
    <>
      <LoginMicrographicCompact tenantName={tenantName} className={className} />
      <LoginMicrographicPanel tenantName={tenantName} className={className} />
    </>
  );
}
