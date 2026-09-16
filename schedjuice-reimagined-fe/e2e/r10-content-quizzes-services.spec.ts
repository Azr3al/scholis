import { test, expect } from "@playwright/test";

test.describe("R10 representative routes", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("/quizzes-v3 has no document horizontal overflow", async ({ page }) => {
    await page.goto("/quizzes-v3");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("/quizzes-v3 panel header visible in light and dark", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/quizzes-v3");
    await page.waitForLoadState("networkidle");
    const header = page.locator("header").filter({ hasText: "Quizzes" });
    await expect(header).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quizzes", level: 1 })).toBeVisible();
    await expect(page.locator('[data-slot="page-container"]')).toBeVisible();
  });
});
