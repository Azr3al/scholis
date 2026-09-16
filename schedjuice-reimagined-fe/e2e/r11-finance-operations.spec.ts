import { test, expect } from "@playwright/test";

test.describe("R11 finance operations", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("/finances/recent-transactions has no document horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      localStorage.setItem("schedjuice:grid-view:recent-transactions", "original");
    });
    await page.goto("/finances/recent-transactions");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expect(
      page.getByRole("heading", { name: "Recent transactions", level: 1 }).first(),
    ).toBeVisible();
  });

  test("/finances/cash-flow has no document horizontal overflow at 1280px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      "/finances/cash-flow?courseId=1&date=2026-07-01T00:00:00.000Z",
    );
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expect(
      page.getByRole("heading", { name: "Cash flow", level: 1 }).first(),
    ).toBeVisible();
  });

  test("recent-transactions transaction ID column respects min width contract", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      localStorage.setItem("schedjuice:grid-view:recent-transactions", "original");
    });
    await page.goto("/finances/recent-transactions");
    await page.waitForLoadState("networkidle");

    const revertToTable = page.getByRole("button", { name: "Revert to original" });
    if (await revertToTable.isVisible().catch(() => false)) {
      await revertToTable.click();
    }

    const txnHeader = page.getByRole("columnheader", { name: "Transaction ID" });
    await expect(txnHeader).toBeVisible({ timeout: 30_000 });

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
});
