import { test, expect } from "@playwright/test";
import {
  dismissOnboardingOverlays,
  readBrowserPrerequisites,
} from "./preflight";

test.describe("R14 upload and verification", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  function uploadUrl(prerequisites: ReturnType<typeof readBrowserPrerequisites>) {
    const courseId = prerequisites.paymentFixtureCourseId ?? "1";
    const date =
      prerequisites.paymentFixtureDate ?? "2026-07-01T00:00:00.000Z";
    const params = new URLSearchParams({
      courseId,
      userId: "2",
    });
    return `/finances/student-payments/upload?${params.toString()}&date=${date}`;
  }

  test("upload page loads enrollment search without invalid sort and shows discounts slot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const prerequisites = readBrowserPrerequisites(
      String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
    );

    const enrollmentSearch = page.waitForResponse(
      (res) =>
        res.url().includes("user-courses/search") &&
        res.request().method() === "POST",
    );

    await page.goto(uploadUrl(prerequisites));
    await dismissOnboardingOverlays(page);

    const searchResponse = await enrollmentSearch;
    expect(searchResponse.status()).toBe(200);

    const searchUrl = new URL(searchResponse.url());
    expect(searchUrl.search).not.toMatch(/\?.*\?/);
    expect(searchUrl.searchParams.get("sorts")).toBe(
      Buffer.from(JSON.stringify([])).toString("base64"),
    );

    await expect(page.getByText("Remaining amount")).toBeVisible();
    await expect(page.getByText("Payment plan")).toBeVisible();

    const discountsLabel = page.getByText("Discounts", { exact: true });
    const notEnrolled = page.getByText(/not enrolled in this course/i);
    await expect(discountsLabel.or(notEnrolled)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("upload page renders PageHeader without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const prerequisites = readBrowserPrerequisites(
      String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
    );
    await page.goto(uploadUrl(prerequisites));
    await page.waitForLoadState("networkidle");
    await dismissOnboardingOverlays(page);

    const pageHeader = page.locator('[data-slot="page-header"]');
    await expect(pageHeader).toBeVisible();
    await expect(
      pageHeader.getByRole("heading", { name: "Upload payment", level: 1 }),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("upload empty submit scrolls first invalid field into view", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    const prerequisites = readBrowserPrerequisites(
      String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
    );
    await page.goto(uploadUrl(prerequisites));
    await page.waitForLoadState("networkidle");
    await dismissOnboardingOverlays(page);
    await page.reload({ waitUntil: "networkidle" });
    await dismissOnboardingOverlays(page);

    const screenshotField = page
      .locator('[data-field-name^="screenshot-upload-part-"]')
      .first();
    await expect(screenshotField).toBeVisible();

    const scrolledAway = await page.evaluate(() => {
      const main = document.getElementById("main-content");
      if (!main) return { ok: false, scrollTop: 0 };
      main.scrollTop = main.scrollHeight;
      return { ok: main.scrollTop > 0, scrollTop: main.scrollTop };
    });
    expect(scrolledAway.ok).toBe(true);

    const offscreenBeforeSubmit = await screenshotField.evaluate((el) => {
      const main = document.getElementById("main-content");
      if (!main) return false;
      const mainRect = main.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const visibleHeight =
        Math.min(rect.bottom, mainRect.bottom) - Math.max(rect.top, mainRect.top);
      return visibleHeight <= 0;
    });
    expect(offscreenBeforeSubmit).toBe(true);

    await page.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByText("Add a screenshot.")).toBeVisible();
    await expect(screenshotField).toHaveAttribute("data-invalid", "");
    await expect
      .poll(
        async () =>
          screenshotField.evaluate((el) => {
            const main = document.getElementById("main-content");
            if (!main) return false;
            const mainRect = main.getBoundingClientRect();
            const rect = el.getBoundingClientRect();
            const visibleHeight =
              Math.min(rect.bottom, mainRect.bottom) -
              Math.max(rect.top, mainRect.top);
            return visibleHeight >= Math.min(rect.height, 48);
          }),
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test("upload page has no horizontal overflow in dark mode", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1280, height: 800 });
    const prerequisites = readBrowserPrerequisites(
      String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
    );
    await page.goto(uploadUrl(prerequisites));
    await page.waitForLoadState("networkidle");
    await dismissOnboardingOverlays(page);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("verification-upload page renders CSV example and PageHeader", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/finances/student-payments/verification-upload");
    await page.waitForLoadState("networkidle");
    await dismissOnboardingOverlays(page);

    await expect(
      page.getByRole("heading", {
        name: "Verify payments from CSV",
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByText("transaction-id", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit verification" }),
    ).toBeDisabled();
  });

  test("coverage-review page renders table without document overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const prerequisites = readBrowserPrerequisites(
      String(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"),
    );
    const courseId = prerequisites.paymentFixtureCourseId ?? "1";
    await page.goto(
      `/finances/student-payments/coverage-review?courseId=${encodeURIComponent(courseId)}`,
    );
    await page.waitForLoadState("networkidle");
    await dismissOnboardingOverlays(page);

    await expect(
      page.getByRole("heading", { name: "Payments to review", level: 1 }),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
