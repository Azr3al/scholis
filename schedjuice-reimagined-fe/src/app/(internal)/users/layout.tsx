export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sj-root flex min-h-full flex-1 flex-col bg-surface-elevated">
      {children}
    </div>
  );
}
