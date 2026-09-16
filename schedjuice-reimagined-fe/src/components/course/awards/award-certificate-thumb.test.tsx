import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AwardCertificateThumb } from "./award-certificate-thumb";

const { composite } = vi.hoisted(() => ({
  composite: vi.fn(),
}));

vi.mock("@/lib/image-template/composite", () => ({
  composite,
}));

const template = {
  id: 9,
  name: "Cert",
  document: {},
  background_url: null,
};

describe("AwardCertificateThumb", () => {
  afterEach(() => {
    cleanup();
    composite.mockReset();
  });

  it("binds the student award photo into the composite", async () => {
    composite.mockResolvedValue({
      toDataURL: () => "data:image/png;base64,thumb",
    });
    render(
      <AwardCertificateThumb
        studentName="Htin Wana"
        courseName="IG 19"
        titleName="Top 1"
        template={template}
        awardImageUrl="https://cdn.example/htin.png"
        mtName="Daw Su"
        mtSignatureUrl="https://cdn.example/mt.png"
        onOpen={() => {}}
      />,
    );
    await waitFor(() => expect(composite).toHaveBeenCalled());
    expect(composite.mock.calls[0]?.[1]?.awardImageUrl).toBe(
      "https://cdn.example/htin.png",
    );
    expect(composite.mock.calls[0]?.[1]?.mtSignatureUrl).toBe(
      "https://cdn.example/mt.png",
    );
  });
});
