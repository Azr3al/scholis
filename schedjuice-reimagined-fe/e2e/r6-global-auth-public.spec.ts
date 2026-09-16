import { test, expect } from "@playwright/test";

test.describe("R6 representative routes", () => {
  test("/login has no document horizontal overflow", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /login to your account/i }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("/login form header visible in light and dark", async ({ page }) => {
    await page.goto("/login");
    const header = page.getByRole("heading", { name: /login to your account/i });
    await expect(header).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(header).toBeVisible();
  });
});
