import type { APIRequestContext, Page } from "@playwright/test";

export type BrowserPrerequisites = {
  baseURL: string;
  apiURL: string;
  email: string;
  password: string;
  paymentFixtureText: string;
  paymentFixtureCourseId?: string;
  paymentFixtureDate?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `[browser preflight] Missing ${name}. Set it before running npm run test:browser; see e2e/README.md.`,
    );
  }
  return value;
}

export function readBrowserPrerequisites(baseURL: string): BrowserPrerequisites {
  return {
    baseURL,
    apiURL: requireEnv("NEXT_PUBLIC_BASE_API_URL"),
    email: requireEnv("PLAYWRIGHT_TEST_EMAIL"),
    password: requireEnv("PLAYWRIGHT_TEST_PASSWORD"),
    paymentFixtureText: requireEnv("PLAYWRIGHT_PAYMENT_FIXTURE_TEXT"),
    paymentFixtureCourseId: process.env.PLAYWRIGHT_PAYMENT_FIXTURE_COURSE_ID?.trim(),
    paymentFixtureDate: process.env.PLAYWRIGHT_PAYMENT_FIXTURE_DATE?.trim(),
  };
}

export function studentPaymentsUrl(prerequisites: BrowserPrerequisites): string {
  const params = new URLSearchParams();
  if (prerequisites.paymentFixtureCourseId) {
    params.set("courseId", prerequisites.paymentFixtureCourseId);
  }
  if (prerequisites.paymentFixtureDate) {
    params.set("date", prerequisites.paymentFixtureDate);
  }
  const query = params.toString();
  return `${prerequisites.baseURL}/finances/student-payments${query ? `?${query}` : ""}`;
}

export async function assertBackendReachable(
  api: APIRequestContext,
  prerequisites: BrowserPrerequisites,
): Promise<void> {
  const response = await api.get(`${prerequisites.apiURL}/organizations/public`);
  if (!response.ok()) {
    throw new Error(
      `[browser preflight] Backend/tenant probe failed: GET ${prerequisites.apiURL}/organizations/public returned ${response.status()}. Start the backend and verify tenant resolution.`,
    );
  }
}

export async function dismissOnboardingOverlays(page: Page): Promise<void> {
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.isVisible().catch(() => false)) {
    await gotIt.click();
  }
}

export async function assertRequiredFixtures(
  page: Page,
  prerequisites: BrowserPrerequisites,
): Promise<void> {
  await page.goto(studentPaymentsUrl(prerequisites));
  await page.waitForLoadState("networkidle");
  await dismissOnboardingOverlays(page);
  await page.locator("table tbody tr").first().waitFor({ timeout: 30_000 });

  const paymentRow = page
    .locator("table tbody tr")
    .filter({ hasText: prerequisites.paymentFixtureText });
  if ((await paymentRow.count()) !== 1) {
    throw new Error(
      `[browser preflight] Expected exactly one payment row containing "${prerequisites.paymentFixtureText}" on /finances/student-payments for ${prerequisites.email}; found ${await paymentRow.count()}. Seed a unique editable row or grant permission before running browser tests.`,
    );
  }
  if ((await paymentRow.locator('[role="combobox"]').count()) < 1) {
    throw new Error(
      `[browser preflight] Payment fixture "${prerequisites.paymentFixtureText}" has no editable status combobox. Use a fixture whose status is editable.`,
    );
  }
  if ((await paymentRow.getByLabel("Delete payment").count()) !== 1) {
    throw new Error(
      `[browser preflight] Payment fixture "${prerequisites.paymentFixtureText}" has no Delete payment control. Use an account with delete permission.`,
    );
  }
}
