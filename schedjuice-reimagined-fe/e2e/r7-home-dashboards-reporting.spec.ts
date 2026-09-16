import { test, expect } from "@playwright/test";

test.describe("R7 representative routes", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("/management/dashboard has no document horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/management/dashboard");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("/management/dashboard shows shell title in light and dark", async ({
    page,
  }) => {
    await page.goto("/management/dashboard");
    await page.waitForLoadState("networkidle");
    const title = page.getByRole("heading", { level: 1, name: "Dashboard" });
    await expect(title).toBeVisible();
    await expect(page.getByText("Start Date")).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(title).toBeVisible();
    await expect(page.getByText("Start Date")).toBeVisible();
  });
});
