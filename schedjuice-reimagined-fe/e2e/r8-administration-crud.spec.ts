import { expect, test } from "./fixtures/auth";

test.describe("R8 representative routes", () => {
  test("/users has no document horizontal overflow", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("/users panel header visible in light and dark", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    const title = page.locator("header h1").filter({ hasText: "Users" });
    await expect(title).toBeVisible();
    await expect(page.locator('[data-slot="page-container"]')).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(title).toBeVisible();
    await expect(page.locator('[data-slot="page-container"]')).toBeVisible();
  });

  test("/users has no document horizontal overflow on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("/users panel title visible on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    const title = page.locator("header h1").filter({ hasText: "Users" });
    await expect(title).toBeAttached();
    await expect(page.locator('[data-slot="page-container"]')).toBeVisible();
    await expect(page.getByRole("tab", { name: "Staff" })).toBeVisible();
  });
});
