export default function AuthenticationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sj-root min-h-screen bg-surface text-text-primary antialiased">
      {children}
    </div>
  );
}
