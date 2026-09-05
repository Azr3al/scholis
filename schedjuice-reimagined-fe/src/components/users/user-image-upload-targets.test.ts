import { describe, expect, it } from "vitest";
import { ImageCropPreset } from "@/components/images/image-crop-presets";
import { USER_IMAGE_UPLOAD_TARGETS } from "./user-image-upload-targets";

describe("USER_IMAGE_UPLOAD_TARGETS", () => {
  it("maps award_image to vertical IdPhoto rect crop", () => {
    const target = USER_IMAGE_UPLOAD_TARGETS.award_image;
    expect(target.cropPreset).toBe(ImageCropPreset.IdPhoto);
    expect(target.cropShape).toBe("rect");
  });

  it("maps id_image to vertical IdPhoto rect crop", () => {
    const target = USER_IMAGE_UPLOAD_TARGETS.id_image;
    expect(target.cropPreset).toBe(ImageCropPreset.IdPhoto);
    expect(target.cropShape).toBe("rect");
  });
});
