import { describe, expect, it } from "vitest";
import { derivedStatus } from "./status";

describe("derivedStatus", () => {
  it("is published only when published_document deeply equals document", () => {
    const document = { version: 1, page: {}, blocks: [] };
    expect(derivedStatus({ document, published_document: null })).toBe("draft");
    expect(derivedStatus({ document, published_document: document })).toBe(
      "published",
    );
    expect(
      derivedStatus({
        document,
        published_document: { ...document, blocks: [{ id: "x" }] },
      }),
    ).toBe("draft");
  });
});
