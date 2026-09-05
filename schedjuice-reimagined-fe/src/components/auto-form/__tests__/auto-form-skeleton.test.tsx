import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AutoFormSkeleton } from "../auto-form-skeleton";
import type { AutoFormGroup } from "../types";

describe("AutoFormSkeleton", () => {

  it("reserves save-tick space above groups in edit mode (matches live AutoForm)", () => {
    const groups: AutoFormGroup[] = [
      { id: "details", title: "Details", fields: ["name"] },
    ];
    const html = renderToStaticMarkup(
      createElement(AutoFormSkeleton, { groups, saveMode: "edit" }),
    );
    expect(html).toContain('data-slot="auto-form-skeleton-save-tick"');
    expect(html).not.toContain('data-slot="auto-form-skeleton-footer"');
    const tickIdx = html.indexOf('data-slot="auto-form-skeleton-save-tick"');
    const groupIdx = html.indexOf('data-slot="auto-form-skeleton-group"');
    expect(tickIdx).toBeGreaterThanOrEqual(0);
    expect(groupIdx).toBeGreaterThan(tickIdx);
  });

  it("can omit create footer for hand-composed hosts (showCreateFooter=false)", () => {
    const groups: AutoFormGroup[] = [
      { id: "identity", title: "Profile", fields: ["name", "roles"] },
    ];
    const html = renderToStaticMarkup(
      createElement(AutoFormSkeleton, {
        groups,
        saveMode: "create",
        showCreateFooter: false,
      }),
    );
    expect(html).toContain('data-group-id="identity"');
    expect(html).not.toContain('data-slot="auto-form-skeleton-footer"');
  });
});
