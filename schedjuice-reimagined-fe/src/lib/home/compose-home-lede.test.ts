import { describe, expect, it } from "vitest";

import { composeHomeLede } from "./compose-home-lede";

describe("composeHomeLede", () => {
  it("returns no-classes copy when count is zero", () => {
    expect(composeHomeLede(0)).toEqual(["No classes scheduled today."]);
  });

  it("uses singular session copy", () => {
    expect(composeHomeLede(1)).toEqual(["One session today."]);
  });
});
