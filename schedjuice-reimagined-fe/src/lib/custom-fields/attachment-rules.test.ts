import { describe, expect, it } from "vitest";

import {
  attachmentRulesFromValidationRules,
  buildAttachmentDropzoneAccept,
  buildAttachmentFileInputAccept,
  PRESET_EXTENSIONS,
} from "@/lib/custom-fields/attachment-rules";

describe("attachmentRulesFromValidationRules", () => {
  it("defaults missing rules", () => {
    const rules = attachmentRulesFromValidationRules(null);
    expect(rules.max_files).toBe(1);
    expect(rules.file_type_preset).toBe("image_document");
    expect(PRESET_EXTENSIONS.image_document.length).toBeGreaterThan(0);
  });

  it("respects configured max file size", () => {
    const rules = attachmentRulesFromValidationRules({ max_file_size_mb: 25 });
    expect(rules.max_file_size_mb).toBe(25);
  });
});

describe("buildAttachmentFileInputAccept", () => {
  it("includes image extensions and MIME types but not pdf for image preset", () => {
    const accept = buildAttachmentFileInputAccept(PRESET_EXTENSIONS.image);
    expect(accept).toContain(".jpg");
    expect(accept).toContain("image/jpeg");
    expect(accept).not.toContain(".pdf");
    expect(accept).not.toContain("application/pdf");
  });

  it("narrows to custom allowed_extensions subset", () => {
    const accept = buildAttachmentFileInputAccept([".png", ".pdf"]);
    expect(accept).toContain(".png");
    expect(accept).toContain(".pdf");
    expect(accept).not.toContain(".jpg");
  });
});

describe("buildAttachmentDropzoneAccept", () => {
  it("groups jpg and jpeg under image/jpeg", () => {
    const accept = buildAttachmentDropzoneAccept([".jpg", ".jpeg", ".png"]);
    expect(accept["image/jpeg"]).toEqual(expect.arrayContaining([".jpg", ".jpeg"]));
    expect(accept["image/png"]).toEqual([".png"]);
  });
});
