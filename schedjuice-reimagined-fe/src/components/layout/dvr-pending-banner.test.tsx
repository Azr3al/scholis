import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DvrPendingBannerView } from "./dvr-pending-banner";

describe("DvrPendingBannerView", () => {
  it("renders due date and verify link", () => {
    render(
      <DvrPendingBannerView
        dvrId={42}
        expiresOn="2026-07-25"
        name="Staff data check"
      />,
    );
    expect(screen.getByText(/verify your profile data/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /verify/i }).getAttribute("href"),
    ).toBe("/data-verification-requests/42/verify");
  });
});
