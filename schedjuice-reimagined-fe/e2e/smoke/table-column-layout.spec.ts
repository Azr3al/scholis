import { test, expect } from "../fixtures/auth";

const PERSON_MIN_REM = 12;
const REM_PX = 16;
const PERSON_MIN_PX = PERSON_MIN_REM * REM_PX;

const TABLE_ROUTES = [
  { route: "/campuses", personColumnHeader: "Name" },
  { route: "/programs", personColumnHeader: "Name" },
] as const;

for (const { route, personColumnHeader } of TABLE_ROUTES) {
  test(`${route} scrolls horizontally before column crushing at 960px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 800 });
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const tableWrapper = page.locator(".overflow-x-auto").first();
    await expect(tableWrapper).toBeVisible();

    const scrollBeforeCrush = await tableWrapper.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollBeforeCrush.scrollWidth).toBeGreaterThan(
      scrollBeforeCrush.clientWidth,
    );

    const personColumn = await page.evaluate(
      ({ headerLabel, minRem }) => {
        const headers = [...document.querySelectorAll("thead th")];
        const index = headers.findIndex(
          (th) => th.textContent?.trim() === headerLabel,
        );
        if (index < 0) return null;

        const col = document.querySelectorAll("colgroup col")[index] as
          | HTMLTableColElement
          | undefined;
        const header = headers[index];
        const firstBodyCell = document.querySelector(
          `tbody tr td:nth-child(${index + 1})`,
        );

        const colStyle = col?.getAttribute("style") ?? "";
        const minWidthMatch = colStyle.match(/min-width:\s*([^;]+)/i);
        const declaredMin = minWidthMatch?.[1]?.trim() ?? null;
        const headerWidth = header?.getBoundingClientRect().width ?? 0;
        const bodyWidth = firstBodyCell?.getBoundingClientRect().width ?? 0;

        return {
          index,
          declaredMin,
          headerWidth,
          bodyWidth,
          minPx: minRem * 16,
        };
      },
      { headerLabel: personColumnHeader, minRem: PERSON_MIN_REM },
    );

    expect(personColumn).not.toBeNull();
    expect(personColumn!.declaredMin).toBe(`${PERSON_MIN_REM}rem`);
    expect(personColumn!.headerWidth).toBeGreaterThanOrEqual(PERSON_MIN_PX - 1);
    expect(personColumn!.bodyWidth).toBeGreaterThanOrEqual(PERSON_MIN_PX - 1);
  });
}
