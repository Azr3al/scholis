import { describe, expect, it } from "vitest";

import { canUploadUserImage, canViewUserImage } from "@/helpers/authorization";
import { role, type accountType } from "@/types/user";

function user(id: number, roles: role[], permissions: string[] = []): accountType {
  return { id, roles, permissions } as accountType;
}

describe("user image permissions", () => {
  it("allows upload when permission held", () => {
    const student = user(1, [role.student], ["user_image.upload.award_image"]);
    expect(canUploadUserImage(student, "award_image")).toBe(true);
  });

  it("denies upload without permission", () => {
    const teacher = user(2, [role.teacher], ["user_image.view.award_image"]);
    expect(canUploadUserImage(teacher, "award_image")).toBe(false);
  });

  it("allows view when view permission held", () => {
    const teacher = user(2, [role.teacher], ["user_image.view.id_image"]);
    expect(canViewUserImage(teacher, "id_image")).toBe(true);
  });
});
