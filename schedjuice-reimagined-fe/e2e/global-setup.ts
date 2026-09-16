import fs from "node:fs";
import path from "node:path";
import { chromium, expect, request, type FullConfig } from "@playwright/test";
import {
  assertBackendReachable,
  assertRequiredFixtures,
  dismissOnboardingOverlays,
  readBrowserPrerequisites,
} from "./preflight";

const authFile = path.join(__dirname, ".auth/admin.json");

async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = String(config.projects[0].use.baseURL);
  const prerequisites = readBrowserPrerequisites(baseURL);
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  const channel = process.env.PLAYWRIGHT_CHANNEL?.trim() || undefined;
  const browser = await chromium.launch(channel ? { channel } : {});
  const apiContext = await request.newContext();
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => {
    localStorage.setItem("schedjuice:grid-view:student-payments", "original");
  });
  const page = await context.newPage();

  try {
    await assertBackendReachable(apiContext, prerequisites);
    // networkidle ensures the login client form is hydrated; clicking too early
    // falls through to a native GET submit and never authenticates.
    await page.goto("/login", { timeout: 60_000, waitUntil: "networkidle" });
    await page.getByLabel(/email/i).fill(prerequisites.email);
    await page.getByLabel(/password/i).fill(prerequisites.password);
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/\/home(?:\?|$)/, { timeout: 30_000 });
    await dismissOnboardingOverlays(page);

    const cookies = await context.cookies();
    if (!cookies.some((cookie) => cookie.name === "access")) {
      throw new Error(
        "[browser preflight] Login completed without an access cookie. Verify credentials and the /login response.",
      );
    }

    await assertRequiredFixtures(page, prerequisites);
    await expect(page.locator("body")).toBeVisible();
    await context.storageState({ path: authFile });
  } finally {
    await apiContext.dispose();
    await browser.close();
  }
}

export default globalSetup;
