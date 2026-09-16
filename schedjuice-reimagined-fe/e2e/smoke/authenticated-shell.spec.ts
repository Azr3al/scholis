import { test, expect } from "../fixtures/auth";

test("authenticated storage opens the internal shell", async ({ page }) => {
  await page.goto("/home");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/home(?:\?|$)/);
  await expect(page.locator("#main-content")).toBeVisible();
});
