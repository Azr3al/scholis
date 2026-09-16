import { describe, expect, it } from "vitest";
import { studentJoinConfirmationCopy } from "./student-join-course-request";

describe("studentJoinConfirmationCopy", () => {
  it("describes a newly sent request", () => {
    const copy = studentJoinConfirmationCopy({
      kind: "request_sent",
      courseTitle: "Math 101",
    });
    expect(copy.title).toBe("Request sent");
    expect(copy.description).toContain("Math 101");
  });

  it("describes an existing pending request", () => {
    const copy = studentJoinConfirmationCopy({
      kind: "already_pending",
      courseTitle: "Science Lab",
    });
    expect(copy.title).toBe("Request pending");
    expect(copy.description).toContain("already under review");
  });

  it("describes an existing enrollment", () => {
    const copy = studentJoinConfirmationCopy({
      kind: "already_enrolled",
      courseTitle: "History",
    });
    expect(copy.title).toBe("Already enrolled");
    expect(copy.description).toContain("already enrolled");
  });
});
