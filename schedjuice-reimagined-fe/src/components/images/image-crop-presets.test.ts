import { describe, expect, it } from "vitest";
import {
  aspectRatioForPreset,
  ID_PHOTO_ASPECT,
  ImageCropPreset,
} from "./image-crop-presets";

describe("aspectRatioForPreset", () => {
  it("returns 170/210 for ID photo (matches card slot)", () => {
    expect(aspectRatioForPreset(ImageCropPreset.IdPhoto)).toBe(ID_PHOTO_ASPECT);
    expect(aspectRatioForPreset(ImageCropPreset.IdPhoto)).toBeCloseTo(170 / 210, 5);
  });
});
