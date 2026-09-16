import { test, expect } from "../fixtures/auth";
import {
  dismissOnboardingOverlays,
  readBrowserPrerequisites,
  studentPaymentsUrl,
} from "../preflight";

test("select listbox is visible and receives click", async ({ page }) => {
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
  const trigger = paymentRow.locator('[role="combobox"]').first();
  await expect(trigger, "editable payment status combobox").toBeVisible();

  await trigger.click();
  const listbox = page.locator('[role="listbox"]').first();
  await expect(listbox).toBeVisible();

  const box = await listbox.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.height).toBeGreaterThan(0);
    expect(box.width).toBeGreaterThan(0);
  }

  const topElement = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el?.getAttribute("role") ?? el?.tagName ?? null;
  }, { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });

  expect(topElement === "listbox" || topElement === "option" || topElement === "LISTBOX").toBeTruthy();
});
