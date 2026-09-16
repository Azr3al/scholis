// src/app/(design)/components/color/page.tsx
const RAW = [
  ["--pixel-white", "Dominant surface"],
  ["--terminal", "Primary ink"],
  ["--circuit-board", "Secondary ink"],
  ["--data-green", "Soft brand"],
  ["--data-green-strong", "Strong accent"],
  ["--danger", "Destructive"],
  ["--success", "Positive"],
  ["--warning", "Caution fill"],
  ["--warning-foreground", "Caution text"],
];

const WARM = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const SEMANTIC = [
  "--surface", "--surface-elevated", "--surface-inverse", "--surface-hover",
  "--text-primary", "--text-secondary", "--text-muted", "--text-on-inverse",
  "--accent", "--accent-foreground", "--brand", "--brand-foreground",
  "--warning", "--warning-foreground",
  "--border", "--border-strong", "--ring",
];

function Swatch({ token, note }: { token: string; note?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="size-10 shrink-0 rounded-md border border-border"
        style={{ backgroundColor: `var(${token})` }}
      />
      <div className="min-w-0">
        <code className="font-mono text-mono-sm text-text-primary">{token}</code>
        {note ? <p className="text-sm text-text-muted">{note}</p> : null}
      </div>
    </div>
  );
}

export default function ColorPage() {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 font-serif text-2xl">Raw palette</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {RAW.map(([token, note]) => (
            <Swatch key={token} token={token} note={note} />
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-4 font-serif text-2xl">Warm ramp</h2>
        <div className="flex flex-wrap gap-2">
          {WARM.map((step) => (
            <div key={step} className="text-center">
              <span
                className="block size-12 rounded-md border border-border"
                style={{ backgroundColor: `var(--warm-${step})` }}
              />
              <code className="font-mono text-xs text-text-muted">{step}</code>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-4 font-serif text-2xl">Semantic tokens</h2>
        <p className="mb-4 text-sm text-text-muted">
          Use the theme toggle to verify each token flips correctly in dark mode.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SEMANTIC.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </section>
    </div>
  );
}
