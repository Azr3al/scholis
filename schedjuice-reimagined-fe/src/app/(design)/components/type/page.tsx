// src/app/(design)/components/type/page.tsx
const SCALE: { token: string; label: string; family: string }[] = [
  { token: "--text-4xl", label: "Hero — 44px", family: "font-serif" },
  { token: "--text-3xl", label: "Page title — 32px", family: "font-serif" },
  { token: "--text-2xl", label: "Section title — 24px", family: "font-serif" },
  { token: "--text-xl", label: "Sub-section — 20px", family: "font-sans" },
  { token: "--text-lg", label: "Emphasized body — 18px", family: "font-sans" },
  { token: "--text-base", label: "Body — 16px", family: "font-sans" },
  { token: "--text-sm", label: "Secondary — 14px", family: "font-sans" },
  { token: "--text-xs", label: "Caption — 12px", family: "font-sans" },
];

export default function TypePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Scale</h2>
        {SCALE.map(({ token, label, family }) => (
          <div key={token} className="border-b border-border pb-3">
            <span className={family} style={{ fontSize: `var(${token})` }}>
              The quiet classroom
            </span>
            <p className="text-xs text-text-muted">
              <code className="font-mono">{token}</code> · {label}
            </p>
          </div>
        ))}
      </section>
      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Families</h2>
        <p className="font-sans text-lg">Schedjuice Sans — body, bilingual by construction.</p>
        <p className="font-serif text-lg">Schedjuice Serif — headers and display.</p>
        <p className="font-hand text-hand text-brand">
          Schedjuice Hand — a few warm moments per surface
        </p>
        <p className="font-mono text-mono-base">Schedjuice Mono — 0123456789 codes &amp; totals</p>
        <p className="text-sm">
          <a
            href="/components/type/handwriting"
            className="text-accent underline-offset-4 hover:underline"
          >
            Schedjuice Hand showcase →
          </a>
        </p>
      </section>
    </div>
  );
}
