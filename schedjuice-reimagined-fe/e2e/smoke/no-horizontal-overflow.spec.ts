import { test, expect } from "../fixtures/auth";

const ROUTES = ["/campuses", "/finances/student-payments"];

for (const route of ROUTES) {
  test(`no document horizontal overflow on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow).toBe(false);
  });
}
