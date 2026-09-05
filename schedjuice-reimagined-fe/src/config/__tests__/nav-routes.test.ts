import { describe, it, expect } from "vitest";
import { navLinks, isNavItemActive } from "../nav-routes";
import { visibleChildren } from "@/components/nav/nav-visibility";

const allPerms = (n: any): string[] => [
  ...(n.requiredPermissions ?? []),
  ...((n.children ?? []).flatMap(allPerms)),
];

describe("nav-routes", () => {
  it("Platform exposes Usage and Internal tools permissions", () => {
    const perms = allPerms({ children: navLinks });
    expect(perms).toContain("ai.usage.view");
    expect(perms).toContain("billing.manage");
    expect(perms).toContain("org.manage_all");
    expect(perms).toContain("chat.participate");
    expect(perms).not.toContain("debug.access");
  });

  it("exposes Messages nav for chat.participate", () => {
    const home = navLinks.find((section) => section.title === "Home");
    const messages = visibleChildren(home!, { canAny: (codes) => codes.includes("chat.participate") }, {} as never, undefined).find(
      (item) => item.href === "/chat",
    );
    expect(messages?.title).toBe("Messages");
    expect(messages?.requiredPermissions).toEqual(["chat.participate"]);
  });

});

describe("isNavItemActive", () => {
  it("highlights Users on /users staff tab", () => {
    const params = new URLSearchParams();
    expect(isNavItemActive("/users", "/users", params)).toBe(true);
    expect(isNavItemActive("/users?tab=students", "/users", params)).toBe(
      false,
    );
  });

  it("highlights Students on /users?tab=students", () => {
    const params = new URLSearchParams("tab=students");
    expect(isNavItemActive("/users?tab=students", "/users", params)).toBe(
      true,
    );
    expect(isNavItemActive("/users", "/users", params)).toBe(false);
  });

  it("highlights Users on user record pages", () => {
    const params = new URLSearchParams();
    expect(isNavItemActive("/users", "/users/42", params)).toBe(true);
    expect(isNavItemActive("/users?tab=students", "/users/42", params)).toBe(
      false,
    );
  });

  it("does not highlight root finance overview on sub-routes", () => {
    const params = new URLSearchParams();
    expect(
      isNavItemActive("/finances", "/finances/student-payments", params, null, false),
    ).toBe(false);
    expect(isNavItemActive("/finances", "/finances", params, null, false)).toBe(
      true,
    );
  });

  it("highlights student payments on nested routes", () => {
    const params = new URLSearchParams();
    expect(
      isNavItemActive(
        "/finances/student-payments",
        "/finances/student-payments/upload",
        params,
      ),
    ).toBe(true);
  });
});
