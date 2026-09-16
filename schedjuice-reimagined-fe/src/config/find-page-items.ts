import { visibleChildren, type NavPermissionChecker } from "@/components/nav/nav-visibility";
import { navLinks, resolveNavItemHref } from "@/config/nav-routes";
import { filterShortcutToolsForUser } from "@/config/shortcuts-tools";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export type FindPageGroup = "pages" | "shortcuts";

export type FindPageItem = {
  id: string;
  title: string;
  description?: string;
  href: string;
  group: FindPageGroup;
};

export function buildFindPageItems(args: {
  checker: NavPermissionChecker;
  tenant: organizationType | null | undefined;
  user: accountType | undefined;
}): FindPageItem[] {
  const pageHrefs = new Set<string>();
  const pages: FindPageItem[] = [];

  for (const section of navLinks) {
    const children = visibleChildren(
      section,
      args.checker,
      args.tenant,
      args.user,
    );
    for (const child of children) {
      if (!child.href && !child.resolveHref) continue;
      const resolved = resolveNavItemHref(child, args.tenant);
      if (resolved === "#" || resolved.includes(":id")) continue;
      pageHrefs.add(resolved);
      pages.push({
        id: `pages:${resolved}`,
        title: child.title,
        description: child.description,
        href: resolved,
        group: "pages",
      });
    }
  }

  const shortcuts: FindPageItem[] = filterShortcutToolsForUser(
    args.user,
    args.tenant,
  )
    .filter((tool) => !pageHrefs.has(tool.href))
    .map((tool) => ({
      id: `shortcuts:${tool.href}`,
      title: tool.title,
      description: tool.description,
      href: tool.href,
      group: "shortcuts" as const,
    }));

  return [...pages, ...shortcuts];
}
