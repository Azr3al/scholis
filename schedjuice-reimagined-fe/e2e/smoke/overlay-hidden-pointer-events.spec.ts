// e2e/smoke/overlay-hidden-pointer-events.spec.ts
import { test, expect } from "../fixtures/auth";

test("closed find-page island fillet does not block header clicks", async ({ page }) => {
  await page.goto("/campuses");
  await page.waitForLoadState("networkidle");

  const headerLink = page.getByRole("link", { name: /campuses|home|dashboard/i }).first();
  await expect(headerLink, "required shell navigation link").toHaveCount(1);
  await expect(headerLink).toBeVisible();

  const linkBox = await headerLink.boundingBox();
  expect(linkBox).not.toBeNull();

  const blocked = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return true;
    const style = getComputedStyle(el);
    return style.pointerEvents === "none" ? false : el.tagName === "SPAN" && style.position === "fixed";
  }, { x: linkBox!.x + 4, y: linkBox!.y + linkBox!.height / 2 });

  expect(blocked).toBe(false);
  await headerLink.click();
});
