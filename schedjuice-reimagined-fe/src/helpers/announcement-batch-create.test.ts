import { describe, expect, it } from "vitest";
import {
  getBatchCreateToastMessage,
  parseAnnouncementBatchCreateResult,
} from "./announcement-batch-create";

describe("parseAnnouncementBatchCreateResult", () => {
  it("reads created and failed rows from the API envelope", () => {
    const result = parseAnnouncementBatchCreateResult({
      data: {
        data: {
          created: [{ id: 1, course_id: 10 }],
          failed: [{ course_id: 99, error: "Course not found." }],
        },
      },
    });
    expect(result.created).toEqual([{ id: 1, course_id: 10 }]);
    expect(result.failed).toEqual([
      { course_id: 99, error: "Course not found." },
    ]);
  });
});

describe("getBatchCreateToastMessage", () => {
  it("uses singular copy for one course", () => {
    expect(getBatchCreateToastMessage(1, 0)).toEqual({
      type: "success",
      description: "Announcement created successfully",
    });
  });

  it("uses plural copy for multiple courses", () => {
    expect(getBatchCreateToastMessage(3, 0)).toEqual({
      type: "success",
      description: "Created announcement for 3 courses",
    });
  });

  it("reports partial failures as an error toast", () => {
    expect(getBatchCreateToastMessage(2, 1)).toEqual({
      type: "error",
      description: "Created for 2 of 3 courses. 1 failed.",
    });
  });
});
