import { test, expect } from "../fixtures/auth";
import {
  dismissOnboardingOverlays,
  readBrowserPrerequisites,
  studentPaymentsUrl,
} from "../preflight";

test("modal traps focus and Escape closes", async ({ page }) => {
  const fixtureText = process.env.PLAYWRIGHT_PAYMENT_FIXTURE_TEXT;
  expect(fixtureText, "PLAYWRIGHT_PAYMENT_FIXTURE_TEXT must be set by preflight").toBeTruthy();

  const prerequisites = readBrowserPrerequisites(
    String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
  );
  await page.goto(studentPaymentsUrl(prerequisites));
  await page.waitForLoadState("networkidle");
  await dismissOnboardingOverlays(page);
  await page.locator("table tbody tr").first().waitFor({ timeout: 30_000 });

  const paymentRow = page.locator("table tbody tr").filter({ hasText: fixtureText! });
  await expect(paymentRow, `payment fixture row "${fixtureText}"`).toHaveCount(1);
  await paymentRow.getByLabel("Delete payment").click();

  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("This action cannot be undone")).toBeVisible();
  await page.keyboard.press("Tab");
  const focusedInDialog = await dialog.evaluate((node) => node.contains(document.activeElement));
  expect(focusedInDialog).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
