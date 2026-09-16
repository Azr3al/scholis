import { test as base } from "@playwright/test";
import path from "node:path";

export const test = base.extend({
  storageState: path.join(__dirname, "../.auth/admin.json"),
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.setItem("schedjuice:grid-view:student-payments", "original");
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";
