import { test, expect } from "../fixtures/auth";

const MIGRATED_ROUTES = [
  { path: "/campuses", title: "Campuses" },
  { path: "/programs", title: "Programs" },
  { path: "/subjects/create", title: "Create subject" },
] as const;

for (const { path, title } of MIGRATED_ROUTES) {
  test(`${path} renders in-flow PageHeader title`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const pageHeader = page.locator('[data-slot="page-header"]');
    await expect(pageHeader).toBeVisible();
    const inFlowTitle = pageHeader.getByRole("heading", { level: 1 });
    await expect(inFlowTitle).toHaveText(title);
    await expect(inFlowTitle).toHaveClass(/font-serif/);
    await expect(inFlowTitle).toHaveClass(/text-3xl/);
    await expect(page.locator('[data-slot="page-container"]')).toBeVisible();
    await expect(
      page.locator(
        '[data-slot="page-section"], [data-slot="page-section-dominant"], [data-slot="page-section-quiet"]',
      ),
    ).toBeVisible();
  });

  test(`${path} wraps header actions on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const header = page.locator('[data-slot="page-header"]');
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(375);
  });
}
