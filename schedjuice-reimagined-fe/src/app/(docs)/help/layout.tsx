import { DocsShell } from "@/components/product-docs/docs-shell";

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
