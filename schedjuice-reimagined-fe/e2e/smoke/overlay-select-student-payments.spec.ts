// e2e/smoke/overlay-select-student-payments.spec.ts
import { test, expect } from "../fixtures/auth";
import {
  dismissOnboardingOverlays,
  readBrowserPrerequisites,
  studentPaymentsUrl,
} from "../preflight";

test("student-payments status select listbox is visible and unclipped", async ({ page }) => {
  const fixtureText = process.env.PLAYWRIGHT_PAYMENT_FIXTURE_TEXT;
  expect(fixtureText, "PLAYWRIGHT_PAYMENT_FIXTURE_TEXT must be set by R0 preflight").toBeTruthy();

  await page.setViewportSize({ width: 1280, height: 800 });
  const prerequisites = readBrowserPrerequisites(
    String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
  );
  await page.goto(studentPaymentsUrl(prerequisites));
  await page.waitForLoadState("networkidle");
  await dismissOnboardingOverlays(page);
  await page.locator("table tbody tr").first().waitFor({ timeout: 30_000 });

  const paymentRow = page.locator("table tbody tr").filter({ hasText: fixtureText! });
  await expect(paymentRow, `payment fixture row "${fixtureText}"`).toHaveCount(1);
  const selectTrigger = paymentRow.locator('[role="combobox"]').first();
  await expect(selectTrigger, "editable payment status combobox").toBeVisible();

  await selectTrigger.click();
  const listbox = page.locator('[role="listbox"]').first();
  await expect(listbox).toBeVisible();

  const triggerBox = await selectTrigger.boundingBox();
  const listBox = await listbox.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(listBox).not.toBeNull();

  if (triggerBox && listBox) {
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(800 + 2);
    expect(listBox.x).toBeGreaterThanOrEqual(0);
    expect(listBox.x + listBox.width).toBeLessThanOrEqual(1280 + 2);
  }

  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('[role="listbox"]') != null || el?.closest('[role="option"]') != null;
  }, { x: listBox!.x + 8, y: listBox!.y + 8 });
  expect(hit).toBe(true);
});
