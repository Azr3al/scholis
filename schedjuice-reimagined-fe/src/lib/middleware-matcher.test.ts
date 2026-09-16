import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { middlewareRunsOnPath } from "./middleware-matcher";

describe("middlewareRunsOnPath", () => {
  it("does not run on public static assets that used to 307 into /login", () => {
    expect(middlewareRunsOnPath("/fonts/noto-sans-latin-400.woff2")).toBe(false);
    expect(middlewareRunsOnPath("/svg-icons/zoom.svg")).toBe(false);
    expect(middlewareRunsOnPath("/sw.js")).toBe(false);
    expect(middlewareRunsOnPath("/changelog")).toBe(false);
  });

  it("does not run on dotted files so bot probes do not SSR /login", () => {
    expect(middlewareRunsOnPath("/.env")).toBe(false);
  });

  it("still gates unauthenticated app routes", () => {
    expect(middlewareRunsOnPath("/")).toBe(true);
    expect(middlewareRunsOnPath("/courses")).toBe(true);
    expect(middlewareRunsOnPath("/home")).toBe(true);
  });

  it("still skips public auth and content routes", () => {
    expect(middlewareRunsOnPath("/login")).toBe(false);
    expect(middlewareRunsOnPath("/register")).toBe(false);
    expect(middlewareRunsOnPath("/public/people")).toBe(false);
    expect(middlewareRunsOnPath("/images/login-1.jpg")).toBe(false);
  });

  it("stays in sync with the middleware.ts matcher literal", () => {
    const helperSrc = readFileSync(
      path.resolve(__dirname, "./middleware-matcher.ts"),
      "utf8",
    );
    const middlewareSrc = readFileSync(
      path.resolve(__dirname, "../middleware.ts"),
      "utf8",
    );
    const helperLiteral = helperSrc.match(
      /MIDDLEWARE_MATCHER =\s*"([^"]+)"/,
    )?.[1];
    const middlewareLiteral = middlewareSrc.match(
      /matcher:\s*\[\s*"([^"]+)"/,
    )?.[1];
    expect(helperLiteral).toBeTruthy();
    expect(middlewareLiteral).toBe(helperLiteral);
  });
});
