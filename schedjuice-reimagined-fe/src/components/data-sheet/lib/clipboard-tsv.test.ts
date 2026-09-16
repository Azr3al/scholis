import { describe, expect, it } from "vitest";

import { parseTsv, serializeTsv, serializeHtmlTable } from "./clipboard-tsv";

describe("serializeTsv", () => {
  it("quotes cells containing tabs, newlines, or quotes", () => {
    expect(serializeTsv([["a\tb"]])).toBe('"a\tb"');
    expect(serializeTsv([["a\nb"]])).toBe('"a\nb"');
    expect(serializeTsv([['he said "hi"']])).toBe('"he said ""hi"""');
  });
});

describe("parseTsv", () => {
  it("normalizes CRLF to LF", () => {
    expect(parseTsv("a\tb\r\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("respects quoted cells with embedded tabs and newlines", () => {
    expect(parseTsv('"a\tb"\tc')).toEqual([["a\tb", "c"]]);
    expect(parseTsv('"a\nb"\tc')).toEqual([["a\nb", "c"]]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseTsv('"he said ""hi"""')).toEqual([['he said "hi"']]);
  });

  it("drops a single trailing newline", () => {
    expect(parseTsv("a\tb\n")).toEqual([["a", "b"]]);
  });
});

describe("serializeHtmlTable", () => {
  it("wraps cells in table markup and escapes html", () => {
    expect(serializeHtmlTable([["a<b", "c"]])).toBe(
      "<table><tr><td>a&lt;b</td><td>c</td></tr></table>",
    );
  });
});
