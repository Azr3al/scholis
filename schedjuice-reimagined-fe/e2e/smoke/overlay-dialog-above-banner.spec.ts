// e2e/smoke/overlay-dialog-above-banner.spec.ts
import { test, expect } from "../fixtures/auth";
import {
  dismissOnboardingOverlays,
  readBrowserPrerequisites,
  studentPaymentsUrl,
} from "../preflight";

test("dialog backdrop and content stack above view-as banner when both visible", async ({ page }) => {
  const fixtureText = process.env.PLAYWRIGHT_PAYMENT_FIXTURE_TEXT;
  expect(fixtureText, "PLAYWRIGHT_PAYMENT_FIXTURE_TEXT must be set by R0 preflight").toBeTruthy();

  const prerequisites = readBrowserPrerequisites(
    String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
  );
  await page.goto(studentPaymentsUrl(prerequisites));
  await page.waitForLoadState("networkidle");
  await dismissOnboardingOverlays(page);
  await page.locator("table tbody tr").first().waitFor({ timeout: 30_000 });

  await page.evaluate(() => {
    const banner = document.createElement("div");
    banner.setAttribute("data-testid", "synthetic-banner");
    banner.className = "sticky top-0 z-banner w-full border-b bg-amber-100 p-2";
    banner.textContent = "Synthetic banner";
    document.body.prepend(banner);
  });

  const paymentRow = page.locator("table tbody tr").filter({ hasText: fixtureText! });
  await expect(paymentRow, `payment fixture row "${fixtureText}"`).toHaveCount(1);
  const dialogTrigger = paymentRow.getByLabel("Delete payment").first();
  await expect(dialogTrigger).toBeVisible();
  await dialogTrigger.click();
  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible();

  const dialogZ = await dialog.evaluate((el) => parseInt(getComputedStyle(el).zIndex, 10));
  const bannerZ = await page.getByTestId("synthetic-banner").evaluate((el) => parseInt(getComputedStyle(el).zIndex, 10));

  expect(dialogZ).toBeGreaterThan(bannerZ);

  const center = await dialog.boundingBox();
  expect(center).not.toBeNull();
  const topEl = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="dialog"]') != null, {
    x: center!.x + center!.width / 2,
    y: center!.y + center!.height / 2,
  });
  expect(topEl).toBe(true);
});
