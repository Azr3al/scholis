import axios from "axios";
import { describe, expect, it, vi } from "vitest";

const makePostRequest = vi.fn();
vi.mock("@/app/client-api/utils", () => ({
  makePostRequest: (...args: unknown[]) => makePostRequest(...args),
}));

import { ensureStudentEnrollments } from "@/lib/finances/payment-enrollment";

describe("ensureStudentEnrollments", () => {
  it("returns enrollments from a successful response", async () => {
    makePostRequest.mockResolvedValueOnce({
      data: {
        isError: false,
        enrollments: [{ course_id: 1, user_course_id: 99 }],
      },
    });
    const result = await ensureStudentEnrollments(10, [1]);
    expect(makePostRequest).toHaveBeenCalledWith(
      "user-payments/ensure-enrollments",
      { user_id: 10, course_ids: [1] },
    );
    expect(result.enrollments).toEqual([{ course_id: 1, user_course_id: 99 }]);
  });

  it("throws with per-course errors from a 400 response", async () => {
    makePostRequest.mockRejectedValueOnce(
      Object.assign(new Error("bad"), {
        isAxiosError: true,
        response: {
          data: {
            isError: true,
            errors: { "2": "Teams link required" },
            enrollments: [{ course_id: 1, user_course_id: 99 }],
          },
        },
      }),
    );
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    await expect(ensureStudentEnrollments(10, [1, 2])).rejects.toMatchObject({
      courseErrors: { "2": "Teams link required" },
      partialEnrollments: [{ course_id: 1, user_course_id: 99 }],
    });
  });
});
