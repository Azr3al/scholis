import { describe, expect, it } from "vitest";

import { mergePeopleHistoryEntries } from "./field-history";

describe("mergePeopleHistoryEntries", () => {
  it("sorts field changes and ID uploads newest first", () => {
    const merged = mergePeopleHistoryEntries(
      [
        {
          id: 1,
          field_key: "name",
          old_value: "Old",
          new_value: "New",
          source: "self",
          created_at: "2026-01-01T10:00:00Z",
          actor_id: 5,
          actor_name: "Stu",
        },
      ],
      [
        {
          id: 9,
          created_at: "2026-01-02T10:00:00Z",
          uploaded_by: { id: 2, name: "Teacher" },
        },
      ],
      (key) => (key === "name" ? "Full name" : key),
    );
    expect(merged.map((row) => row.key)).toEqual(["id-image-9", "field-1"]);
    expect(merged[0]?.label).toBe("ID photo");
    expect(merged[1]?.old_value).toBe("Old");
    expect(merged[1]?.new_value).toBe("New");
  });
});
