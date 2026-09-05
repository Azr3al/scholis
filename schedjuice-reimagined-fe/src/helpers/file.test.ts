// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "@/helpers/file";

describe("downloadFile", () => {
  let click: ReturnType<typeof vi.fn>;
  let created: HTMLAnchorElement | null;

  beforeEach(() => {
    click = vi.fn();
    created = null;
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag !== "a") {
        return document.createElement(tag);
      }
      const a = {
        href: "",
        download: "",
        target: "",
        click,
        parentNode: document.body,
        parentElement: document.body,
      } as unknown as HTMLAnchorElement;
      created = a;
      return a;
    });
    vi.spyOn(document.body, "appendChild").mockImplementation(
      (node) => node as Node,
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      (node) => node as Node,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets download and href, clicks, and does not open a blank target", () => {
    downloadFile("blob:http://localhost/fake", "receipt-1.pdf");
    expect(created?.href).toBe("blob:http://localhost/fake");
    expect(created?.download).toBe("receipt-1.pdf");
    expect(created?.target).toBe("");
    expect(click).toHaveBeenCalledTimes(1);
  });
});
