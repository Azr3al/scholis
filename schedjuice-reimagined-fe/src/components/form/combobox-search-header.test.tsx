import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ComboboxSearchHeader } from "./combobox-search-header";

describe("ComboboxSearchHeader", () => {

  it("hides hint when query has non-whitespace text", () => {
    const html = renderToStaticMarkup(
      createElement(ComboboxSearchHeader, {
        label: "Course",
        value: "CAE",
        onChange: () => {},
      }),
    );
    expect(html).not.toContain("Type to filter the list");
  });

  it("keeps hint for whitespace-only query", () => {
    const html = renderToStaticMarkup(
      createElement(ComboboxSearchHeader, {
        label: "Course",
        value: "   ",
        onChange: () => {},
      }),
    );
    expect(html).toContain("Type to filter the list");
  });

  it("uses explicit placeholder when provided", () => {
    const html = renderToStaticMarkup(
      createElement(ComboboxSearchHeader, {
        label: "Course",
        placeholder: "Find a class",
        value: "",
        onChange: () => {},
      }),
    );
    expect(html).toContain('placeholder="Find a class"');
    expect(html).toContain('aria-label="Search Course"');
  });
});
