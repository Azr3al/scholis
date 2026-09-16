/**
 * One-off changelog screenshot capture. Run from schedjuice-reimagined-fe:
 *   node scripts/capture-changelog-screenshots.mjs
 *
 * Requires FE at localhost:3000 and BE at localhost:8000.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const base = "http://localhost:3000";
const outRoot = path.join(process.cwd(), "public/changelog");
const email = "james@schedjuice.com";
const password = "password123";

/** Entry id folder slug = id without date prefix when id is YYYY-MM-DD-slug */
function folderForId(id) {
  return id;
}

const shots = [
  {
    id: "2026-08-07-import-mark-sheets-from-a-spreadsheet",
    file: "mark-sheet-import.png",
    url: "/courses/96/grading/mark-sheets/new",
    alt: "Mark sheet import wizard with spreadsheet upload",
    caption: "Upload a spreadsheet and map columns before saving the mark sheet.",
  },
  {
    id: "2026-08-05-join-a-course-with-a-code-from-academic-hub",
    file: "academic-hub.png",
    url: "/courses",
    alt: "Academic Hub with join code entry",
    caption: "Enter a join code from Academic Hub when you have one from your teacher.",
    beforeScreenshot: async (page) => {
      const joinBtn = page.getByRole("button", { name: /join code/i });
      if (await joinBtn.isVisible().catch(() => false)) {
        await joinBtn.click();
        await page.waitForTimeout(800);
      }
    },
  },
  {
    id: "2026-08-05-smoother-registration-and-sign-in-screens",
    file: "sign-in.png",
    url: "/login",
    alt: "Sign-in screen with improved layout",
    caption: "Sign-in screens use clearer spacing and typography.",
    noAuth: true,
  },
  {
    id: "2026-08-06-attendance-counts-stay-accurate",
    file: "attendance-overview.png",
    url: "/attendances/god-view",
    alt: "Attendance overview with monthly student summary",
    caption: "Monthly summaries include unregistered students and stay aligned with enrollment.",
  },
  {
    id: "2026-08-02-a-finance-overview-on-the-home-page",
    file: "finance-home.png",
    url: "/finances",
    alt: "Finance home page with charts and quick links",
    caption: "See income, balances, and quick links on the finance home page.",
  },
  {
    id: "2026-08-02-open-attachments-on-course-updates",
    file: "course-feed.png",
    url: "/courses/96/feed",
    alt: "Course feed with post attachments",
    caption: "Open attachments on course feed posts without leaving the page.",
  },
  {
    id: "2026-07-28-log-in-with-telegram",
    file: "telegram-login.png",
    url: "/login",
    alt: "Sign-in page with Telegram login option",
    caption: "Sign in with Telegram when your school enables it.",
    noAuth: true,
  },
  {
    id: "2026-07-30-clearer-payment-receipts-and-receipt-numbers",
    file: "payment-receipts.png",
    url: "/finances/student-payments",
    alt: "Student payments list with receipt details",
    caption: "Receipt numbers, payment dates, and clearer receipt previews in the payments list.",
  },
  {
    id: "2026-07-29-record-one-payment-across-several-courses",
    file: "multi-course-upload.png",
    url: "/finances/student-payments/upload",
    alt: "Multi-course payment upload form",
    caption: "Record one payment across several courses with per-course month coverage.",
  },
  {
    id: "2026-07-28-assign-substitute-teachers-on-a-course",
    file: "substitute-teachers.png",
    url: "/courses/96/teachers",
    alt: "Course teacher assignment with substitute roles",
    caption: "Assign substitute main and assistant teachers on a course.",
  },
  {
    id: "2026-07-30-customize-id-cards-with-templates",
    file: "id-card-templates.png",
    url: "/id-card/settings",
    alt: "ID card template settings",
    caption: "Customize ID card templates with course title and expiry options.",
  },
  {
    id: "2026-07-24-check-in-when-a-course-has-ended",
    file: "checkin-history.png",
    url: "/courses/96/checkin-history/0",
    alt: "Course check-in history with session times",
    caption: "Check in and review history even when a course has ended.",
  },
  {
    id: "2026-07-26-overnight-class-sessions",
    file: "create-course.png",
    url: "/courses/create",
    alt: "Create course schedule with session times",
    caption: "Schedule overnight sessions that cross midnight.",
  },
  {
    id: "2026-07-23-edit-payment-remarks-in-the-payments-table",
    file: "payment-remarks.png",
    url: "/finances/student-payments",
    alt: "Student payments table with remarks column",
    caption: "Edit payment remarks directly in the payments table.",
  },
  {
    id: "2026-07-10-see-password-rules-as-you-type",
    file: "password-rules.png",
    url: "/reset-password",
    alt: "Password reset with live requirement checklist",
    caption: "Password requirements turn green as you meet each rule.",
    noAuth: true,
  },
];

async function dismissOnboarding(page) {
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.isVisible().catch(() => false)) {
    await gotIt.click();
  }
}

async function login(page) {
  await page.goto("/login", { waitUntil: "networkidle", timeout: 90000 });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: "Submit" }).click();
  await page.waitForURL(/\/home(?:\?|$)/, { timeout: 60000 });
  await dismissOnboarding(page);
}

const browser = await chromium.launch();
const authContext = await browser.newContext({ baseURL: base });
const authPage = await authContext.newPage();
const results = [];

try {
  await login(authPage);
  console.log("Logged in as admin");

  for (const shot of shots) {
    const dir = path.join(outRoot, folderForId(shot.id));
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, shot.file);
    const publicSrc = `/changelog/${folderForId(shot.id)}/${shot.file}`;

    try {
      const context = shot.noAuth
        ? await browser.newContext({ baseURL: base })
        : authContext;
      const page = shot.noAuth ? await context.newPage() : authPage;

      await page.goto(shot.url, { waitUntil: "networkidle", timeout: 90000 });
      if (!shot.noAuth) await dismissOnboarding(page);
      if (shot.beforeScreenshot) await shot.beforeScreenshot(page);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: dest, fullPage: true });

      if (shot.noAuth) await context.close();

      results.push({
        id: shot.id,
        ok: true,
        src: publicSrc,
        alt: shot.alt,
        caption: shot.caption,
        file: shot.file,
      });
      console.log("OK", shot.id);
    } catch (err) {
      results.push({
        id: shot.id,
        ok: false,
        error: String(err),
      });
      console.error("FAIL", shot.id, err.message ?? err);
    }
  }
} catch (err) {
  console.error("Login or setup failed:", err);
  process.exitCode = 1;
} finally {
  await browser.close();
}

const reportPath = path.join(process.cwd(), "scripts/changelog-screenshot-results.json");
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
console.log("Report written to", reportPath);
