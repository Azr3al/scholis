import { describe, it, expect } from "vitest";
import {
  classifyRouteFamily,
  classifyRiskTier,
  classifyCoverageMode,
  classifyVerificationVariants,
  toRoutePattern,
} from "../route-manifest-classifier";
import type { RouteFamily } from "../route-manifest-schema";

describe("toRoutePattern", () => {
  it("converts app path to route pattern", () => {
    expect(
      toRoutePattern("src/app/(internal)/users/[id]/edit/page.tsx"),
    ).toBe("/users/:id/edit");
  });

  it("converts public auth path", () => {
    expect(
      toRoutePattern("src/app/(public)/(auth)/login/page.tsx"),
    ).toBe("/login");
  });

  it("converts the root page to slash", () => {
    expect(toRoutePattern("src/app/page.tsx")).toBe("/");
  });
});

describe("classifyRouteFamily", () => {
  it("classifies login as global-shell-auth-public", () => {
    expect(
      classifyRouteFamily("src/app/(public)/(auth)/login/page.tsx"),
    ).toBe("global-shell-auth-public");
  });

  it("classifies management dashboard as home-dashboard-analytics", () => {
    expect(
      classifyRouteFamily(
        "src/app/(internal)/management/dashboard/page.tsx",
      ),
    ).toBe("home-dashboard-analytics");
  });

  it("classifies campuses list as administration-crud", () => {
    expect(
      classifyRouteFamily("src/app/(internal)/campuses/page.tsx"),
    ).toBe("administration-crud");
  });

  it("classifies course edit as courses-attendance-scheduling", () => {
    expect(
      classifyRouteFamily("src/app/(internal)/courses/[id]/edit/page.tsx"),
    ).toBe("courses-attendance-scheduling");
  });

  it("classifies quizzes-v3 as quizzes-docs-content-services", () => {
    expect(
      classifyRouteFamily("src/app/(internal)/quizzes-v3/page.tsx"),
    ).toBe("quizzes-docs-content-services");
  });

  it("classifies finances payroll as finance-operations", () => {
    expect(
      classifyRouteFamily("src/app/(internal)/finances/payroll/page.tsx"),
    ).toBe("finance-operations");
  });

  it("classifies student-payments index as student-payments", () => {
    expect(
      classifyRouteFamily(
        "src/app/(internal)/finances/student-payments/page.tsx",
      ),
    ).toBe("student-payments");
  });

  it("classifies transaction lookup as student-payments", () => {
    expect(
      classifyRouteFamily(
        "src/app/(internal)/finances/student-payments/transaction-lookup/page.tsx",
      ),
    ).toBe("student-payments");
  });

  it("classifies course student payments as student-payments", () => {
    expect(
      classifyRouteFamily(
        "src/app/(internal)/courses/[id]/student-payments/page.tsx",
      ),
    ).toBe("student-payments");
  });

  it("classifies upload as payment-upload-verification", () => {
    expect(
      classifyRouteFamily(
        "src/app/(internal)/finances/student-payments/upload/page.tsx",
      ),
    ).toBe("payment-upload-verification");
  });
});

describe("classifyRiskTier", () => {
  it("marks student-payments upload as high", () => {
    expect(
      classifyRiskTier(
        "payment-upload-verification",
        "/finances/student-payments/upload",
      ),
    ).toBe("high");
  });

  it("marks library as low", () => {
    expect(
      classifyRiskTier(
        "quizzes-docs-content-services",
        "/library",
      ),
    ).toBe("low");
  });
});

describe("classifyVerificationVariants", () => {
  it.each([
    "/finances/student-payments",
    "/finances/student-payments/transaction-lookup",
    "/courses/:id/student-payments",
  ])("assigns shell, ResourceTable, and Glide to %s", (routePattern) => {
    expect(
      classifyVerificationVariants(routePattern).map((variant) => variant.id),
    ).toEqual(["shared-shell", "resource-table", "glide"]);
  });

  it("assigns default and Glide to recent transactions", () => {
    expect(
      classifyVerificationVariants("/finances/recent-transactions").map(
        (variant) => variant.id,
      ),
    ).toEqual(["default", "glide"]);
  });

  it("assigns default to ordinary routes", () => {
    expect(
      classifyVerificationVariants("/campuses").map((variant) => variant.id),
    ).toEqual(["default"]);
  });
});

describe("classifyCoverageMode", () => {
  it("marks the first low-risk route per family as representative", () => {
    const routes: Array<{
      routePattern: string;
      routeFamily: RouteFamily;
    }> = [
      {
        routePattern: "/campuses",
        routeFamily: "administration-crud",
      },
      {
        routePattern: "/library",
        routeFamily: "quizzes-docs-content-services",
      },
    ];
    const modes = routes.map((r) =>
      classifyCoverageMode(r, routes, new Set()),
    );
    expect(modes.every((m) => m === "representative")).toBe(true);
  });

  it("marks automated smoke-covered routes as automated", () => {
    const route = {
      routePattern: "/finances/student-payments",
      routeFamily: "student-payments" as RouteFamily,
    };
    const allRoutes = [route];
    const automatedSmokePatterns = new Set(["/finances/student-payments"]);
    expect(classifyCoverageMode(route, allRoutes, automatedSmokePatterns)).toBe(
      "automated",
    );
  });
});
