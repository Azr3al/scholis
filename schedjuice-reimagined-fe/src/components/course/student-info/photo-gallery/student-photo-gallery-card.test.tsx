import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudentPhotoGalleryCard } from "./student-photo-gallery-card";

vi.mock("@/components/users/user-image-upload-dialog", () => ({
  UserImageUploadDialog: () => null,
}));

vi.mock("@/components/course/student-info/student-photo-history-sheet", () => ({
  StudentPhotoHistorySheet: () => null,
}));

describe("StudentPhotoGalleryCard", () => {
  it("shows upload when course teacher can upload", () => {
    render(
      <StudentPhotoGalleryCard
        student={{ id: 7, name: "Jane" }}
        typeFilter="id"
        idUrl={null}
        awardUrl={null}
        idSource={null}
        awardSource={null}
        canUploadId
        canUploadAward={false}
        canViewId
        canViewAward={false}
        courseId={99}
        recordQueryKey={["course-student-info-photos", 99]}
      />,
    );
    expect(screen.getByRole("button", { name: /upload/i })).toBeTruthy();
  });

  it("hides award slot when filter is id", () => {
    render(
      <StudentPhotoGalleryCard
        student={{ id: 7, name: "Jane" }}
        typeFilter="id"
        idUrl={null}
        awardUrl="https://example.com/a.jpg"
        idSource={null}
        awardSource="user_image"
        canUploadId
        canUploadAward
        canViewId
        canViewAward
        courseId={99}
        recordQueryKey={["course-student-info-photos", 99]}
      />,
    );
    expect(screen.queryByText("Award Photo")).toBeNull();
  });
});
