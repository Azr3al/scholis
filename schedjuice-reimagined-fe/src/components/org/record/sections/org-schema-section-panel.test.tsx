import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";

import { getObjectFormSchema } from "@/components/auto-form";
import { organizationOwnerEditSchema } from "@/types/organization";

import { OrgSchemaSectionPanel } from "./org-schema-section-panel";

vi.mock("@/components/auto-form/auto-form-field", () => ({
  AutoFormField: ({ name }: { name: string }) => <div data-testid={`field-${name}`} />,
}));

function PanelHarness({ sectionId }: { sectionId: string }) {
  const objectFormSchema = getObjectFormSchema(organizationOwnerEditSchema);
  const form = useForm({ defaultValues: {} });

  return (
    <OrgSchemaSectionPanel
      sectionId={sectionId}
      form={form}
      objectFormSchema={objectFormSchema}
      fieldConfig={{}}
    />
  );
}

describe("OrgSchemaSectionPanel headers", () => {
  it("renders one h2 and no h3 for single-sub-group sections (reports)", () => {
    const { container } = render(<PanelHarness sectionId="reports" />);
    expect(container.querySelectorAll("h2")).toHaveLength(1);
    expect(container.querySelectorAll("h3")).toHaveLength(0);
  });

  it("renders one h2 and multiple h3 sub-groups for invoicing", () => {
    const { container } = render(<PanelHarness sectionId="invoicing" />);
    expect(container.querySelectorAll("h2")).toHaveLength(1);
    expect(container.querySelectorAll("h3").length).toBeGreaterThan(1);
  });
});
