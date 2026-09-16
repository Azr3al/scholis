import { describe, expect, it } from "vitest";
import { insertChromeForKind, isImagePaletteKey } from "./insert-chrome";

describe("insertChromeForKind", () => {
  it("puts student award photo in award Fields and hides the Photo button", () => {
    const chrome = insertChromeForKind("award");
    expect(chrome.showPhoto).toBe(false);
    expect(chrome.fieldItems.map((i) => i.key)).toContain("photo");
    expect(chrome.fieldItems.find((item) => item.key === "photo")).toEqual({
      key: "photo",
      label: "Student award photo",
      visual: "image",
    });
    expect(chrome.fieldItems.map((i) => i.key)).toContain("student_name");
    expect(chrome.fieldItems.map((i) => i.key)).not.toContain("qr");
    expect(chrome.fieldItems.map((i) => i.key)).not.toContain("text");
  });

  it("keeps a dedicated Photo button on ID cards", () => {
    const chrome = insertChromeForKind("id_card");
    expect(chrome.showPhoto).toBe(true);
    expect(chrome.fieldItems.map((i) => i.key)).not.toContain("photo");
  });

  it("marks photo and signature fields as image and name fields as text", () => {
    expect(isImagePaletteKey("mt_signature")).toBe(true);
    expect(isImagePaletteKey("user_signature")).toBe(true);
    expect(isImagePaletteKey("qr")).toBe(true);
    expect(isImagePaletteKey("photo")).toBe(true);
    expect(isImagePaletteKey("student_name")).toBe(false);
    const chrome = insertChromeForKind("award");
    expect(chrome.fieldItems.find((item) => item.key === "mt_signature")?.visual).toBe(
      "image",
    );
    expect(chrome.fieldItems.find((item) => item.key === "student_name")?.visual).toBe(
      "text",
    );
  });
});
