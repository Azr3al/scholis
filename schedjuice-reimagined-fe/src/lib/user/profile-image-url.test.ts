import { describe, expect, it } from "vitest";
import {
  mergeAccountPreservingProfileImage,
  normalizeProfileImagePath,
} from "./profile-image-url";
import type { accountType } from "@/types/user";

const base = { id: 1, name: "Test", roles: [] } as unknown as accountType;

describe("normalizeProfileImagePath", () => {
  it("returns null for empty", () => {
    expect(normalizeProfileImagePath(null)).toBeNull();
    expect(normalizeProfileImagePath("")).toBeNull();
  });

  it("strips query params from absolute URLs", () => {
    const a =
      "https://cdn.example.com/u/1.jpg?X-Amz-Signature=aaa&X-Amz-Expires=3600";
    const b =
      "https://cdn.example.com/u/1.jpg?X-Amz-Signature=bbb&X-Amz-Expires=3600";
    expect(normalizeProfileImagePath(a)).toBe(normalizeProfileImagePath(b));
  });

});

describe("mergeAccountPreservingProfileImage", () => {
  it("keeps previous profile_image when path unchanged", () => {
    const prev = {
      ...base,
      profile_image: "https://x/u/1.jpg?sig=old",
    };
    const next = {
      ...base,
      profile_image: "https://x/u/1.jpg?sig=new",
      email: "new@example.com",
    };
    const merged = mergeAccountPreservingProfileImage(prev, next);
    expect(merged.profile_image).toBe(prev.profile_image);
    expect(merged.email).toBe("new@example.com");
  });

  it("uses next image when path changed", () => {
    const prev = { ...base, profile_image: "https://x/a.jpg?q=1" };
    const next = { ...base, profile_image: "https://x/b.jpg?q=2" };
    expect(mergeAccountPreservingProfileImage(prev, next).profile_image).toBe(
      next.profile_image,
    );
  });

  it("keeps previous cover_image when path unchanged", () => {
    const prev = {
      ...base,
      cover_image: "https://x/cover.jpg?sig=old",
    };
    const next = {
      ...base,
      cover_image: "https://x/cover.jpg?sig=new",
    };
    const merged = mergeAccountPreservingProfileImage(prev, next);
    expect(merged.cover_image).toBe(prev.cover_image);
  });
});
