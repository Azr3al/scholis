import { test, expect } from "../fixtures/auth";

test.describe("form control sizing", () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test("/users/create fields respect narrow measure and keep focus stable", async ({ page }) => {
    await page.goto("/users/create");
    await page.waitForLoadState("networkidle");

    const firstField = page.locator('[data-field-name]').first();
    const secondField = page.locator('[data-field-name]').nth(1);
    await expect(firstField).toBeVisible();
    await expect(secondField).toBeVisible();

    const fieldRoot = firstField.locator("xpath=ancestor::*[contains(@class,'max-w-')]").first();
    const maxWidthClass = await fieldRoot.getAttribute("class");
    expect(maxWidthClass ?? "").toMatch(/max-w-md/);

    const secondFieldName = await secondField.getAttribute("data-field-name");
    expect(secondFieldName).toBeTruthy();

    await firstField.locator("input, textarea, [role='combobox']").first().click();
    await firstField.locator("input, textarea, [role='combobox']").first().fill("Ada");
    await secondField.locator("input, textarea, [role='combobox']").first().click();
    await secondField.locator("input, textarea, [role='combobox']").first().fill("Lovelace");

    const activeFieldName = await page.evaluate(() =>
      document.activeElement?.closest("[data-field-name]")?.getAttribute("data-field-name") ?? null,
    );
    expect(activeFieldName).toBe(secondFieldName);
  });

  test("date range filter DatePicker fills toolbar slot on login activity", async ({ page }) => {
    await page.goto("/organizations/user-activity/login-activity?preset=custom");
    await page.waitForLoadState("networkidle");

    const dateTrigger = page.locator("#ua-from button").first();
    await expect(dateTrigger).toBeVisible();
    const box = await dateTrigger.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(120);
  });
});
