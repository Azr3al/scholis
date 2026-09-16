import { test, expect } from "@playwright/test";

test.describe("R9 representative routes", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("/courses/1/attendance/marking/0 has no document horizontal overflow", async ({ page }) => {
    await page.goto("/courses/1/attendance/marking/0");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test("/courses/1/attendance/marking/0 panel header visible in light and dark", async ({ page }) => {
    await page.goto("/courses/1/attendance/marking/0");
    await page.waitForLoadState("networkidle");
    const header = page.getByTestId("attendance-marking-header");
    await expect(header).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(header).toBeVisible();
  });
});
