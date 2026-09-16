export default function TemplateEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sj-root min-h-dvh bg-surface-sunken text-text-primary antialiased">
      {children}
    </div>
  );
}
