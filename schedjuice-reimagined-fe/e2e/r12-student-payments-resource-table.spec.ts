import { test, expect } from "@playwright/test";
import {
  dismissOnboardingOverlays,
  readBrowserPrerequisites,
  studentPaymentsUrl,
} from "./preflight";

test.describe("R12 student-payments ResourceTable", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("schedjuice:grid-view:student-payments", "original");
    });
  });

  test("/finances/student-payments ResourceTable has transaction ID min width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const prerequisites = readBrowserPrerequisites(
      String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
    );
    await page.goto(studentPaymentsUrl(prerequisites));
    await page.waitForLoadState("networkidle");
    await dismissOnboardingOverlays(page);
    await page.locator("table tbody tr").first().waitFor({ timeout: 30_000 });

    const revertToTable = page.getByRole("button", { name: "Revert to original" });
    if (await revertToTable.isVisible().catch(() => false)) {
      await revertToTable.click();
    }

    await expect(page.getByText("Student payments").first()).toBeVisible();

    const txnColumn = await page.evaluate(() => {
      const headers = [...document.querySelectorAll("thead th")];
      const index = headers.findIndex(
        (th) => th.textContent?.trim() === "Transaction ID",
      );
      if (index < 0) return null;
      const col = document.querySelectorAll("colgroup col")[index] as
        | HTMLTableColElement
        | undefined;
      const colStyle = col?.getAttribute("style") ?? "";
      const minWidthMatch = colStyle.match(/min-width:\s*([^;]+)/i);
      const declaredMin = minWidthMatch?.[1]?.trim() ?? null;
      const headerWidth = headers[index]?.getBoundingClientRect().width ?? 0;
      return { declaredMin, headerWidth, minPx: 18 * 16 };
    });

    expect(txnColumn).not.toBeNull();
    expect(txnColumn!.declaredMin).toBe("18rem");
    expect(txnColumn!.headerWidth).toBeGreaterThanOrEqual(txnColumn!.minPx - 1);
  });

  test("/finances/student-payments shows month selector on ResourceTable path", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const prerequisites = readBrowserPrerequisites(
      String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
    );
    await page.goto(studentPaymentsUrl(prerequisites));
    await page.waitForLoadState("networkidle");
    await dismissOnboardingOverlays(page);
    await page.locator("table tbody tr").first().waitFor({ timeout: 30_000 });

    await expect(page.getByText("Month", { exact: true })).toBeVisible();
  });

  test("/courses/:id/student-payments shows month selector on ResourceTable path", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const prerequisites = readBrowserPrerequisites(
      String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
    );
    const courseId = prerequisites.paymentFixtureCourseId ?? "96";
    const date = prerequisites.paymentFixtureDate ?? "2026-07-01T00:00:00.000Z";
    await page.goto(
      `/courses/${courseId}/student-payments?date=${encodeURIComponent(date)}`,
    );
    await page.waitForLoadState("networkidle");
    await dismissOnboardingOverlays(page);
    await page.locator("table tbody tr").first().waitFor({ timeout: 30_000 });

    await expect(page.getByText("Month", { exact: true })).toBeVisible();
  });

  test("transaction lookup hides month selector and header upload actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      "/finances/student-payments/transaction-lookup?transactionId=TEST-TXN",
    );
    await page.waitForLoadState("networkidle");
    await dismissOnboardingOverlays(page);
    await page.locator("table tbody tr").first().waitFor({ timeout: 30_000 });

    await expect(page.getByText("Month", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Upload Verification File" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Transaction lookup", level: 1 }).first(),
    ).toBeVisible();
  });
});
