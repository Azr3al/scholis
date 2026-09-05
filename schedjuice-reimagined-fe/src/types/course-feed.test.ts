import { describe, expect, it } from "vitest";
import { authorAvatar, authorName, dailyLessonDisplayHeader } from "@/types/course-feed";

describe("course-feed helpers", () => {
  it("falls back when created_by is numeric", () => {
    expect(authorName(42)).toBe("Unknown");
    expect(authorAvatar(42)).toBeNull();
  });

  it("falls back when expanded author omits name or avatar", () => {
    expect(authorName({ id: 1 })).toBe("Unknown");
    expect(authorAvatar({ id: 1, name: "Jane" })).toBeNull();
  });

});
