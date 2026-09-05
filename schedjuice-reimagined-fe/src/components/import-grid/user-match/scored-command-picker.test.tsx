import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ScoredCommandPicker } from "./scored-command-picker";

describe("ScoredCommandPicker", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows suggestions when the query is shorter than two characters", () => {
    render(
      <ScoredCommandPicker
        contextLabel="Spreadsheet value: “Alpha”"
        query="A"
        suggestions={[
          { id: 1, title: "Suggested course", subtitle: "C-1", score: 91 },
        ]}
        searchResults={[]}
        onQueryChange={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText("Suggested course")).toBeTruthy();
    expect(screen.queryByText("Remote course")).toBeNull();
    expect(screen.getByText("91%")).toBeTruthy();
  });

  it("switches to search results when the query reaches two characters", () => {
    render(
      <ScoredCommandPicker
        contextLabel="Spreadsheet value: “Alpha”"
        query="Alp"
        suggestions={[
          { id: 1, title: "Suggested course", subtitle: "C-1", score: 91 },
        ]}
        searchResults={[{ id: 2, title: "Remote course", subtitle: "C-2", score: null }]}
        onQueryChange={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText("Remote course")).toBeTruthy();
    expect(screen.queryByText("Suggested course")).toBeNull();
  });
});
