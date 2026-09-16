import { describe, expect, it } from "vitest";
import { unknownTokens } from "./tokens";

describe("unknownTokens", () => {
  it("unknownTokens reports keys outside the locked palette", () => {
    expect(unknownTokens("Hi {{nope}}")).toEqual(["nope"]);
    expect(unknownTokens("Hi {{student_name}}")).toEqual([]);
  });
});
