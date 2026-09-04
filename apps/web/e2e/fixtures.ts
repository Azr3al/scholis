import { test as base, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

export interface Teacher {
  email: string;
  orgSlug: string;
}

/**
 * Signs a teacher in without going through email.
 *
 * The dev mailer prints the magic link instead of sending it, so there's no
 * inbox to poll. Better Auth exposes the verify endpoint, and the dev-only
 * `/api/dev/magic-link` returns the token for a provisioned address.
 */
const signIn = async (request: APIRequestContext, page: Page, email: string): Promise<void> => {
  const res = await request.post(`${API}/api/dev/magic-link`, { data: { email } });
  if (!res.ok()) {
    throw new Error(
      `Could not get a sign-in link for ${email}. Is the API running with NODE_ENV=development, ` +
        `and has the org been provisioned?`,
    );
  }

  const { url } = (await res.json()) as { url: string };
  await page.goto(url);
  await page.waitForURL('**/teacher');
};

export const test = base.extend<{ teacher: Teacher; signedIn: Page }>({
  teacher: async ({ request }, use) => {
    const slug = `e2e-${Date.now().toString(36)}`;
    const email = `head@${slug}.test`;

    const res = await request.post(`${API}/api/dev/provision`, {
      data: { name: 'E2E School', slug, email, owner: 'E2E Teacher' },
    });
    if (!res.ok()) throw new Error(`Provisioning failed: ${await res.text()}`);

    await use({ email, orgSlug: slug });
  },

  signedIn: async ({ page, request, teacher }, use) => {
    await signIn(request, page, teacher.email);
    await use(page);
  },
});

export { expect } from '@playwright/test';
