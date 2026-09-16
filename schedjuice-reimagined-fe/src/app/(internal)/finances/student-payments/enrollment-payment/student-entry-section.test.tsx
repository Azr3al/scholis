import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  StudentPaymentEntrySection,
  createStudentEntry,
} from "./student-entry-section";

vi.mock("@/app/client-api/utils", () => ({
  searchEntities: vi.fn(),
}));

vi.mock("@/components/form/entity-combobox", () => ({
  default: () => null,
}));

vi.mock("@/components/form/multi-combo-box", () => ({
  MultiCombobox: () => null,
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
});

describe("StudentPaymentEntrySection", () => {
  it("does not loop parent updates on mount with an empty entry", async () => {
    const entry = createStudentEntry();
    const onUpdateEntry = vi.fn();

    render(
      wrap(
        <StudentPaymentEntrySection
          entryKey={entry.key}
          entry={entry}
          index={0}
          canRemove={false}
          defaultBillingMonth={new Date(2026, 7, 1)}
          currencySymbol="$"
          autoEnrollEnabled
          onUpdateEntry={onUpdateEntry}
          onRemove={vi.fn()}
          onCoursesChanged={vi.fn()}
        />,
      ),
    );

    await waitFor(() => {
      expect(onUpdateEntry.mock.calls.length).toBeLessThanOrEqual(1);
    });
  });
});
