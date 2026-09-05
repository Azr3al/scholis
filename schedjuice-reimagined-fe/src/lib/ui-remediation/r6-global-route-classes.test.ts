import { describe, expect, it } from "vitest";
import { resolveGlobalRouteLayout } from "./r6-global-route-classes";

describe("resolveGlobalRouteLayout", () => {

  it("classifies legal and join routes as public-card", () => {
    expect(resolveGlobalRouteLayout("/(public)/(tnc)/terms")).toBe("public-card");
    expect(resolveGlobalRouteLayout("/(public)/join-course/[code]")).toBe("public-card");
    expect(resolveGlobalRouteLayout("/(public)/book-consultation/[slug]")).toBe("public-card");
    expect(resolveGlobalRouteLayout("/(public)/book-consultation/cancel")).toBe("public-card");
    expect(resolveGlobalRouteLayout("/(public)/book-consultation/booking")).toBe("public-card");
  });

  it("classifies internal global routes as shell-standard", () => {
    expect(resolveGlobalRouteLayout("/(internal)/search")).toBe("shell-standard");
    expect(resolveGlobalRouteLayout("/(internal)/notifications")).toBe("shell-standard");
  });
});
