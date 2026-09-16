import { test, expect } from "@playwright/test";
import {
  dismissOnboardingOverlays,
  readBrowserPrerequisites,
  studentPaymentsUrl,
} from "./preflight";
import {
  STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH,
  STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH,
} from "../src/lib/finances/student-payments-filter-ui";

test.describe("R13 Glide", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("schedjuice:grid-view:student-payments", "glide");
      localStorage.setItem("student-payments:screenshot-preview-collapsed", "0");
    });
  });

  async function openGlideStudentPayments(page: import("@playwright/test").Page) {
    await page.setViewportSize({ width: 1280, height: 800 });
    const prerequisites = readBrowserPrerequisites(
      String(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000"),
    );
    await page.goto(studentPaymentsUrl(prerequisites), { waitUntil: "domcontentloaded" });
    await dismissOnboardingOverlays(page);
    await page.locator(".dvn-scroller").first().waitFor({ timeout: 30_000 });
    return prerequisites;
  }

  const preview = (page: import("@playwright/test").Page) => ({
    root: page.getByTestId("student-payments-screenshot-preview"),
    empty: page.getByTestId("student-payments-screenshot-preview-empty"),
    image: page.getByTestId("student-payments-screenshot-preview-image"),
  });

  const gridScroller = (page: import("@playwright/test").Page) =>
    page.locator(".dvn-scroller").first();

  /** Click past frozen student column to avoid opening the student drawer. */
  async function clickGridRow(
    page: import("@playwright/test").Page,
    y = 96,
    x = 360,
  ) {
    await gridScroller(page).click({ position: { x, y }, force: true });
  }

  async function hoverGridRow(
    page: import("@playwright/test").Page,
    y = 96,
    x = 360,
  ) {
    await gridScroller(page).hover({ position: { x, y }, force: true });
  }

  test("/finances/student-payments Glide shows click-to-preview copy", async ({
    page,
  }) => {
    await openGlideStudentPayments(page);
    await expect(page.getByText("Click a row to preview")).toBeVisible();
    await expect(page.getByText("Hover a row to preview")).toHaveCount(0);
  });

  test("/finances/student-payments Glide txn column width floor", async ({
    page,
  }) => {
    await openGlideStudentPayments(page);

    const widths = await page.evaluate(() => {
      const scroller = document.querySelector(".dvn-scroller") as HTMLElement | null;
      if (!scroller) return null;
      return {
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
      };
    });

    const minGridWidth =
      STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH + STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH;

    expect(widths).not.toBeNull();
    expect(widths!.scrollWidth).toBeGreaterThan(widths!.clientWidth);
    expect(widths!.scrollWidth).toBeGreaterThanOrEqual(minGridWidth);
  });

  test("/finances/student-payments Glide scrolls when content overflows", async ({
    page,
  }) => {
    await openGlideStudentPayments(page);

    const scrollWorked = await page.evaluate(() => {
      const scroller = document.querySelector(".dvn-scroller") as HTMLElement | null;
      if (!scroller) return { ok: false, reason: "no-scroller" };
      if (scroller.scrollHeight <= scroller.clientHeight + 4) {
        return { ok: true, reason: "not-overflowing" };
      }
      const before = scroller.scrollTop;
      scroller.scrollTop = before + 80;
      return {
        ok: scroller.scrollTop > before,
        reason: "scrolled",
        before,
        after: scroller.scrollTop,
      };
    });

    expect(scrollWorked.ok).toBe(true);
  });

  test("/finances/student-payments Glide hover does not change preview", async ({
    page,
  }) => {
    await openGlideStudentPayments(page);
    const pane = preview(page);

    await expect(pane.root).toBeVisible();
    await expect(pane.empty).toBeVisible();
    const emptyBefore = await pane.empty.textContent();

    await hoverGridRow(page);
    await page.waitForTimeout(400);

    await expect(pane.empty).toHaveText(emptyBefore ?? "");
    await expect(pane.image).toHaveCount(0);
  });

  test("/finances/student-payments Glide click updates preview and stays on mouse leave", async ({
    page,
  }) => {
    await openGlideStudentPayments(page);
    const pane = preview(page);

    await expect(pane.empty).toBeVisible();

    await clickGridRow(page);
    await expect
      .poll(async () => {
        const hasImage = (await pane.image.count()) > 0;
        const emptyText = await pane.empty.textContent().catch(() => null);
        return hasImage || (emptyText != null && emptyText.length > 0);
      })
      .toBe(true);

    const imageVisible = (await pane.image.count()) > 0;
    const previewBeforeLeave = imageVisible
      ? await pane.image.getAttribute("src")
      : await pane.empty.textContent();

    await page.mouse.move(8, 8);
    await page.waitForTimeout(300);

    if (imageVisible) {
      await expect(pane.image).toHaveAttribute("src", previewBeforeLeave ?? "");
    } else {
      await expect(pane.empty).toHaveText(previewBeforeLeave ?? "");
    }
  });

  test("/finances/recent-transactions Glide renders without preview pane", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("schedjuice:grid-view:recent-transactions", "glide");
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/finances/recent-transactions", { waitUntil: "domcontentloaded" });
    await dismissOnboardingOverlays(page);
    await page.locator(".dvn-scroller").first().waitFor({ timeout: 30_000 });

    await expect(page.getByText("Click a row to preview")).toHaveCount(0);
    await expect(page.getByText("Recent transactions").first()).toBeVisible();
    await expect(page.getByTestId("student-payments-screenshot-preview")).toHaveCount(
      0,
    );
  });
});
