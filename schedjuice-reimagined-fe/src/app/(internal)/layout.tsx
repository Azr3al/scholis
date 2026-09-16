import "../globals.css";
import "../shell-layout-styles.css";
import { AppShell } from "@/components/shell/app-shell";

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
