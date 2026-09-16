import { describe, expect, it } from "vitest";

import { assignHeadingIds } from "./heading-to-id";

describe("assignHeadingIds", () => {
  it("deduplicates with numeric suffix", () => {
    expect(assignHeadingIds(["Setup", "Setup"])).toEqual(["setup", "setup-2"]);
  });
});
