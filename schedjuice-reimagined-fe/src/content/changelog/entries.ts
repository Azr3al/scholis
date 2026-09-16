import type { ChangelogEntry } from "./types";

/**
 * Static changelog entries. Newest first.
 * Append entries via the `/summarize-changelog` Cursor command.
 *
 * Write for school founders, admins, teachers, and (when audience is
 * `everyone`) students — plain language, no jargon.
 */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    id: "2026-08-07-import-mark-sheets-from-a-spreadsheet",
    audience: "staff",
    title: "Import mark sheets from a spreadsheet",
    publishedAt: "2026-08-07",
    summary:
      "Upload a spreadsheet to create a mark sheet—match students to roster rows and map columns before you save.",
    bullets: [
      "Start a new mark sheet by uploading a spreadsheet instead of typing every score by hand.",
      "Match spreadsheet rows to enrolled students with suggestions and manual picks.",
      "Map columns to rubric fields and resize column widths in the import grid.",
      "Review inferred headers and adjust mappings before committing the sheet.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "New mark sheet", href: "/courses/96/grading/mark-sheets/new" },
      { label: "Course mark sheets", href: "/courses/96/grading/mark-sheets" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-08-07-import-mark-sheets-from-a-spreadsheet/mark-sheet-import.png",
        alt: "Mark sheet import wizard with spreadsheet upload",
        caption: "Upload a spreadsheet and map columns before saving the mark sheet.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: ["fee50cf8", "7e04cd71", "bb85ce3", "d02dc3a"],
      transcriptsFound: true,
      notes: "Includes uncommitted mark-sheet import wizard work.",
    },
  },
  {
    id: "2026-08-05-join-a-course-with-a-code-from-academic-hub",
    audience: "everyone",
    title: "Join a course with a code from Academic Hub",
    publishedAt: "2026-08-05",
    summary:
      "Students can enter a join code from Academic Hub when they are not enrolled in any course yet.",
    bullets: [
      "Open Academic Hub and use Enter join code when you have a code from your teacher.",
      "Paste or type the code—Schedjuice parses common formats for you.",
      "After you submit, your join request is sent for school approval.",
      "The course list refreshes without blocking the whole page.",
    ],
    categories: ["feature"],
    affectedAreas: [{ label: "Academic Hub", href: "/courses" }],
    screenshots: [
      {
        src: "/changelog/2026-08-05-join-a-course-with-a-code-from-academic-hub/academic-hub.png",
        alt: "Academic Hub with join code entry",
        caption: "Enter a join code from Academic Hub when you have one from your teacher.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: [
        "21b34dae",
        "5e9afe8f",
        "0534ca45",
        "05dac7c9",
        "ca926715",
        "daea74cd",
      ],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-08-05-smoother-registration-and-sign-in-screens",
    audience: "everyone",
    title: "Smoother registration and sign-in screens",
    publishedAt: "2026-08-05",
    summary:
      "Registration and one-time-password screens are easier to read with clearer layout and spacing.",
    bullets: [
      "Registration forms use improved spacing and typography for long forms.",
      "OTP entry and verification screens are easier to scan on phones.",
      "Copy and field layout are more consistent across sign-up steps.",
    ],
    categories: ["improvement"],
    affectedAreas: [
      { label: "Registration", href: "/register" },
      { label: "Sign in", href: "/login" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-08-05-smoother-registration-and-sign-in-screens/sign-in.png",
        alt: "Sign-in screen with improved layout",
        caption: "Sign-in screens use clearer spacing and typography.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: ["686979bc", "8e7ffd6d"],
      transcriptsFound: false,
    },
  },
  {
    id: "2026-08-06-attendance-counts-stay-accurate",
    audience: "staff",
    title: "Attendance counts stay accurate",
    publishedAt: "2026-08-06",
    summary:
      "Monthly attendance summaries and check-in history reflect enrolled students and course changes more reliably.",
    bullets: [
      "Monthly student summaries now include Unregistered in attendance metrics.",
      "Check-in history student counts refresh when course enrollment changes.",
      "Improved error messages when check-in fails so you know what to fix.",
      "Fixed cases where attendance marking did not match the selected session.",
    ],
    categories: ["fix", "improvement"],
    affectedAreas: [
      { label: "Attendance overview", href: "/attendances/god-view" },
      { label: "Course check-in history", href: "/courses/96/checkin-history/0" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-08-06-attendance-counts-stay-accurate/attendance-overview.png",
        alt: "Attendance overview with monthly student summary",
        caption: "Monthly summaries include unregistered students and stay aligned with enrollment.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: [
        "646f1aea",
        "ed85ab9e",
        "6ca99fb",
        "ea1ddec",
        "08b500f8",
        "dc4d5c52",
        "2cd42cc6",
        "c8145f8",
        "a9db592",
      ],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-08-02-a-finance-overview-on-the-home-page",
    audience: "staff",
    title: "A finance overview on the home page",
    publishedAt: "2026-08-02",
    summary:
      "Open Finances for a program-scoped dashboard with charts and quick links to common money tasks.",
    bullets: [
      "See income, outstanding balances, and trends on a dedicated finance home page.",
      "Charts and totals respect the program you are working in.",
      "Jump to student payments, payroll, and reports from quick links on the page.",
      "Finance pages stay in the finance section of the sidebar as you navigate.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Finance home", href: "/finances" },
      { label: "Student payments", href: "/finances/student-payments" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-08-02-a-finance-overview-on-the-home-page/finance-home.png",
        alt: "Finance home page with charts and quick links",
        caption: "See income, balances, and quick links on the finance home page.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: ["7c9f949f", "97787b85", "df8af91", "a14f924"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-08-02-open-attachments-on-course-updates",
    audience: "everyone",
    title: "Open attachments on course updates",
    publishedAt: "2026-08-02",
    summary:
      "View files attached to course feed posts and announcements without leaving the page.",
    bullets: [
      "Course feed posts can include file attachments you can open in a viewer.",
      "Announcements support the same attachment preview experience.",
      "Inline images in Teams announcements are sized appropriately for the channel.",
    ],
    categories: ["improvement"],
    affectedAreas: [
      { label: "Course feed", href: "/courses/96/feed" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-08-02-open-attachments-on-course-updates/course-feed.png",
        alt: "Course feed with post attachments",
        caption: "Open attachments on course feed posts without leaving the page.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: ["1624bbfd", "683f139a", "a8aad942", "5c52f3d"],
      transcriptsFound: true,
      notes: "Includes uncommitted course-feed attachment staging work.",
    },
  },
  {
    id: "2026-07-28-log-in-with-telegram",
    audience: "everyone",
    title: "Log in with Telegram",
    publishedAt: "2026-07-28",
    summary:
      "Schools that enable it can sign in with Telegram instead of typing a password on web and mobile.",
    bullets: [
      "Sign in with Telegram when your school turns on Telegram login.",
      "Link your Telegram account from your profile connectors section.",
      "Mobile users can complete login through a Telegram bridge page.",
      "Telegram bot deep links open the right app flow on phones.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Sign in", href: "/login" },
      { label: "Your profile", href: "/profile" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-28-log-in-with-telegram/telegram-login.png",
        alt: "Sign-in page with Telegram login option",
        caption: "Sign in with Telegram when your school enables it.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: [
        "575dc609",
        "58265b16",
        "cff9b0e2",
        "19b58cd",
        "c0ea60e",
        "b0c172c",
      ],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-07-30-clearer-payment-receipts-and-receipt-numbers",
    audience: "staff",
    title: "Clearer payment receipts and receipt numbers",
    publishedAt: "2026-07-30",
    summary:
      "Payment receipts show sequential numbers, payment dates, and optional screenshots—with methods detected automatically.",
    bullets: [
      "Receipts display sequential receipt numbers your school can reset when needed.",
      "Payment date appears on receipts, tables, and the upload form.",
      "Staff e-signatures can appear on printed receipts when configured.",
      "Payment methods are auto-detected from screenshots when possible.",
      "You can record a payment without a screenshot when your school allows it.",
    ],
    categories: ["improvement", "fix"],
    affectedAreas: [
      { label: "Student payments", href: "/finances/student-payments" },
      { label: "Record student payment", href: "/finances/student-payments/upload" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-30-clearer-payment-receipts-and-receipt-numbers/payment-receipts.png",
        alt: "Student payments list with receipt details",
        caption: "Receipt numbers, payment dates, and clearer receipt previews in the payments list.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: [
        "1e1f9105",
        "a5147861",
        "7161810f",
        "2920deba",
        "931dce14",
        "44ddcc84",
        "f1294dd",
        "4ea3f47",
        "a809d22",
      ],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-07-29-record-one-payment-across-several-courses",
    audience: "staff",
    title: "Record one payment across several courses",
    publishedAt: "2026-07-29",
    summary:
      "Upload a single payment that covers multiple courses and choose which months each course is paid for.",
    bullets: [
      "Select several courses on one payment upload when a student pays for multiple classes.",
      "Set month coverage per course so billing matches what was actually paid.",
      "Receipts list every course line with a shared receipt number.",
      "Recent transactions include a quick link to open the receipt.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Record student payment", href: "/finances/student-payments/upload" },
      { label: "Recent transactions", href: "/finances/recent-transactions" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-29-record-one-payment-across-several-courses/multi-course-upload.png",
        alt: "Multi-course payment upload form",
        caption: "Record one payment across several courses with per-course month coverage.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: [
        "019bb389",
        "7053508a",
        "774f8e52",
        "7271ded",
        "aa8395c",
        "5cea491c",
      ],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-07-28-assign-substitute-teachers-on-a-course",
    audience: "staff",
    title: "Assign substitute teachers on a course",
    publishedAt: "2026-07-28",
    summary:
      "Add substitute main and assistant teachers on a course with a rebuilt assignment flow and collision checks.",
    bullets: [
      "Assign substitute main and assistant teachers alongside permanent staff.",
      "Search picks up candidates who are not already on the course roster.",
      "Session scheduling warns when new sessions would collide with existing ones.",
      "Find students enrolled in no courses from enrollment tools.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Course teachers", href: "/courses/96/teachers" },
      { label: "Create course", href: "/courses/create" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-28-assign-substitute-teachers-on-a-course/substitute-teachers.png",
        alt: "Course teacher assignment with substitute roles",
        caption: "Assign substitute main and assistant teachers on a course.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: ["65683a3d", "5018817", "0faec06", "5564a50"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-07-30-customize-id-cards-with-templates",
    audience: "staff",
    title: "Customize ID cards with templates",
    publishedAt: "2026-07-30",
    summary:
      "Design ID card templates with a course title slot and optional per-course expiry dates.",
    bullets: [
      "Create and edit ID card templates with a dedicated template editor.",
      "Templates can show the course title on student ID cards.",
      "Set an optional expiry date on each course when your school enables it.",
      "Preview ID cards while editing student and staff data sheets.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "ID card settings", href: "/id-card/settings" },
      { label: "Student data", href: "/users/students" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-30-customize-id-cards-with-templates/id-card-templates.png",
        alt: "ID card template settings",
        caption: "Customize ID card templates with course title and expiry options.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: [
        "3b8060f8",
        "8ca5889c",
        "675ee5dd",
        "e589ccb",
        "64f4c78",
        "056c7e2",
      ],
      transcriptsFound: true,
      notes: "Focuses on template slot and expiry—earlier June entries cover basic ID cards.",
    },
  },
  {
    id: "2026-07-24-check-in-when-a-course-has-ended",
    audience: "staff",
    title: "Check in when a course has ended",
    publishedAt: "2026-07-24",
    summary:
      "Teachers can check in for sessions after a course has ended when your school allows it.",
    bullets: [
      "Check-in stays available for ended courses when policy allows late attendance.",
      "The app picks the right session based on course status and schedule.",
      "Check-in history uses 12-hour time display for easier reading.",
    ],
    categories: ["feature", "fix"],
    affectedAreas: [
      { label: "Course check-in", href: "/courses/96/checkin" },
      { label: "Course check-in history", href: "/courses/96/checkin-history/0" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-24-check-in-when-a-course-has-ended/checkin-history.png",
        alt: "Course check-in history with session times",
        caption: "Check in and review history even when a course has ended.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: ["27ccfe6f", "b6b214f", "7311566e"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-07-26-overnight-class-sessions",
    audience: "staff",
    title: "Overnight class sessions",
    publishedAt: "2026-07-26",
    summary:
      "Schedule sessions that cross midnight—for example evening classes that run into the next morning.",
    bullets: [
      "Create intake sessions that start one day and end the next.",
      "Course scheduling and check-in respect overnight session boundaries.",
      "Legacy quiz tooling was retired in favor of the current quiz experience.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Create course", href: "/courses/create" },
      { label: "Program intakes", href: "/programs" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-26-overnight-class-sessions/create-course.png",
        alt: "Create course schedule with session times",
        caption: "Schedule overnight sessions that cross midnight.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: ["e94c163a", "f926eeb", "7311566e"],
      transcriptsFound: false,
    },
  },
  {
    id: "2026-07-23-edit-payment-remarks-in-the-payments-table",
    audience: "staff",
    title: "Edit payment remarks in the payments table",
    publishedAt: "2026-07-23",
    summary:
      "Update remarks on student payments directly from the payments list without opening each record.",
    bullets: [
      "Edit remarks inline in the student payments table.",
      "Search payments by student or reference from the table toolbar.",
      "Staff payment uploads get clearer KPay screenshot processing.",
      "Payroll and staff payment rows show when a payment was confirmed.",
    ],
    categories: ["improvement"],
    affectedAreas: [
      { label: "Student payments", href: "/finances/student-payments" },
      { label: "Staff payments", href: "/finances/staff-payments" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-23-edit-payment-remarks-in-the-payments-table/payment-remarks.png",
        alt: "Student payments table with remarks column",
        caption: "Edit payment remarks directly in the payments table.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-08-07T14:00:00+06:30",
      summarizedCommits: { fe: "fee50cf8", be: "d02dc3a" },
      sinceCommits: { fe: "b8be679", be: "eaccc3d" },
      commitRefs: [
        "3cc52eb5",
        "72f40ff1",
        "225f107",
        "42df67d6",
        "643d0f0",
        "5ccbe9d8",
      ],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-07-13-apply-discounts-when-recording-payments",
    audience: "staff",
    title: "Apply discounts when recording a payment",
    publishedAt: "2026-07-13",
    summary:
      "Pick an eligible discount when uploading a student payment and see the updated amount before you save.",
    bullets: [
      "Choose a discount on the payment upload form and preview how it changes the amount owed.",
      "Rule-based discounts—early bird, loyalty, and bulk—only appear when the student qualifies.",
      "Schools that use plan-based billing can require a payment plan on every course.",
      "Legacy discount fields can be hidden for schools that no longer use them.",
      "The upload form shows how much is still owed after each payment part.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Record student payment", href: "/finances/student-payments/upload" },
      { label: "Discount catalog", href: "/discounts" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-13-apply-discounts-when-recording-payments/payment-discount.png",
        alt: "Student payment upload with discount picker and remaining amount",
        caption: "Pick an eligible discount and see the updated balance before saving.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-13T10:30:00+06:30",
      summarizedCommits: { fe: "b8be679", be: "eaccc3d" },
      sinceCommits: { fe: "b94e5c5", be: "e157cc2" },
      commitRefs: [
        "b8be679",
        "eaccc3d",
        "d6c9d3e8",
        "590071dd",
        "7cbcac23",
        "b022453d",
        "d3ed82b",
        "2e57082",
        "aaa5d9a",
        "2112822",
      ],
      transcriptsFound: true,
      notes:
        "Omitted: UI migration/remediation scaffolding, chat legacy removal, TypeScript bump.",
    },
  },
  {
    id: "2026-07-13-record-payments-with-multiple-screenshots",
    audience: "staff",
    title: "Record a payment with multiple screenshots",
    publishedAt: "2026-07-13",
    summary:
      "Attach two or more payment screenshots for one logical payment, each with its own method and amount.",
    bullets: [
      "Add multiple screenshots when a student pays in more than one transfer or method.",
      "Payment details fill in right away after you choose each screenshot.",
      "The payments list shows one row per payment—open it to see every part.",
      "Click a row to preview the receipt image in a side panel.",
      "Add a description and remarks for each screenshot when uploading.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Record student payment", href: "/finances/student-payments/upload" },
      { label: "Student payments", href: "/finances/student-payments" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-13-record-payments-with-multiple-screenshots/multipart-upload.png",
        alt: "Multi-part student payment upload form",
        caption: "Record one payment backed by multiple screenshots and methods.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-13T10:30:00+06:30",
      summarizedCommits: { fe: "b8be679", be: "eaccc3d" },
      sinceCommits: { fe: "b94e5c5", be: "e157cc2" },
      commitRefs: [
        "777d94e0",
        "228df716",
        "fd67a85e",
        "1b1aa5e",
        "a476d9e",
        "1c18c82",
        "5a87924",
      ],
      transcriptsFound: true,
      notes:
        "Covers R11–R14 student-payments table and Glide preview polish. Omitted: UI remediation internals.",
    },
  },
  {
    id: "2026-07-12-track-issues-on-a-kanban-board",
    audience: "staff",
    title: "Track issues on a Kanban board",
    publishedAt: "2026-07-13",
    summary:
      "Move internal tasks and student-support tickets across customizable status columns on a new Issues board.",
    bullets: [
      "Drag cards across status columns for internal work and student-support tickets.",
      "Assign one owner and add observers who stay in the loop.",
      "Mention a colleague in a comment to add them as an observer automatically.",
      "Observers can receive email when a card’s status changes (school setting).",
      "Configure issue statuses from the board settings page.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Issues board", href: "/crm/issues" },
      { label: "Issue statuses", href: "/crm/issues/settings" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-12-track-issues-on-a-kanban-board/issues-board.png",
        alt: "Issues Kanban board with status columns",
        caption: "Track internal work and support tickets on a shared board.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-13T10:30:00+06:30",
      summarizedCommits: { fe: "b8be679", be: "eaccc3d" },
      sinceCommits: { fe: "b94e5c5", be: "e157cc2" },
      commitRefs: ["f6e66df8", "f0846d2", "2bb7b98", "49410cf", "93ef563"],
      transcriptsFound: true,
      notes: "Students do not see the Issues board. Omitted: Leads kanban refactor internals.",
    },
  },
  {
    id: "2026-07-10-request-a-check-in-correction",
    audience: "staff",
    title: "Request a check-in correction",
    publishedAt: "2026-07-13",
    summary:
      "Teachers can submit a correction when their check-in time was wrong, with an optional supporting photo.",
    bullets: [
      "Submit a correction from the course check-in history when your times were recorded incorrectly.",
      "Optionally attach a photo to support the correction request.",
      "Check-in timing respects your school’s timezone more reliably.",
      "Fixed cases where check-in was disabled too early or the wrong session was selected.",
    ],
    categories: ["feature", "fix"],
    affectedAreas: [
      { label: "Course check-in history", href: "/courses/96/checkin-history/0" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-10-request-a-check-in-correction/checkin-correction.png",
        alt: "Course check-in history with correction options",
        caption: "Request a correction and optionally attach a supporting photo.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-13T10:30:00+06:30",
      summarizedCommits: { fe: "b8be679", be: "eaccc3d" },
      sinceCommits: { fe: "b94e5c5", be: "e157cc2" },
      commitRefs: [
        "3a55f740",
        "420f3bd2",
        "7d22877",
        "4c57855",
        "af2fe99",
        "4872d0d",
      ],
      transcriptsFound: true,
      notes:
        "Session payroll BE work omitted as largely covered by the July 6 attendance entry.",
    },
  },
  {
    id: "2026-07-10-see-password-rules-as-you-type",
    audience: "everyone",
    title: "See password rules as you type",
    publishedAt: "2026-07-13",
    summary:
      "Password requirements show as a live checklist while you create or reset your password.",
    bullets: [
      "Password requirements appear as a checklist while you type.",
      "Each rule turns green as soon as your password meets it.",
      "Works on both new account registration and password reset.",
    ],
    categories: ["improvement"],
    affectedAreas: [
      { label: "Registration", href: "/register" },
      { label: "Password reset", href: "/reset-password" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-10-see-password-rules-as-you-type/password-rules.png",
        alt: "Password reset with live requirement checklist",
        caption: "Password requirements turn green as you meet each rule.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-13T10:30:00+06:30",
      summarizedCommits: { fe: "b8be679", be: "eaccc3d" },
      sinceCommits: { fe: "b94e5c5", be: "e157cc2" },
      commitRefs: ["a7b6eeed", "77324c93", "26dead7b"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-07-07-find-possible-duplicate-student-accounts",
    audience: "staff",
    title: "Find possible duplicate student accounts",
    publishedAt: "2026-07-13",
    summary:
      "Review clusters of student accounts that may be duplicates and merge them when appropriate.",
    bullets: [
      "Review clusters of student accounts that may be duplicates.",
      "See why accounts were matched—name, email, phone, and similar signals.",
      "Open a merge flow to combine duplicate records when appropriate.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "User insights", href: "/shortcuts/user-insights" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-07-find-possible-duplicate-student-accounts/duplicate-clusters.png",
        alt: "User insights duplicate clusters table",
        caption: "Spot possible duplicate accounts and review why they were matched.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-13T10:30:00+06:30",
      summarizedCommits: { fe: "b8be679", be: "eaccc3d" },
      sinceCommits: { fe: "b94e5c5", be: "e157cc2" },
      commitRefs: ["9090fc16", "e69f768"],
      transcriptsFound: true,
      notes:
        "Course insights rename omitted as incremental polish. Omitted: Telegram bot and sibling detector internals.",
    },
  },
  {
    id: "2026-07-06-share-course-updates-to-teams",
    audience: "staff",
    title: "Share course updates to Teams",
    publishedAt: "2026-07-06",
    summary:
      "Post announcements and daily lessons on the course feed and optionally sync them to the course Microsoft Teams channel.",
    bullets: [
      "Choose to sync a feed post to Teams when your school connects courses to Microsoft Teams.",
      "The composer remembers whether you last posted an announcement or a daily lesson.",
      "Announcement posts include a date picker so you can schedule or backdate updates.",
      "You get a heads-up when rich formatting in a post cannot be sent to Teams.",
      "Daily lesson posts are more reliable when attaching units and lesson content.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [{ label: "Course overview", href: "/courses/139" }],
    screenshots: [
      {
        src: "/changelog/2026-07-06-share-course-updates-to-teams/course-feed.png",
        alt: "Course feed composer with Teams sync option",
        caption: "Share announcements and lessons on the feed—and to Teams when enabled.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-06T17:15:00+06:30",
      summarizedCommits: { fe: "b94e5c5", be: "e157cc2" },
      sinceCommits: { fe: "48b4a688", be: "d7ab8a3" },
      commitRefs: ["bc62ccd5", "b94e5c5", "e157cc2", "afd834dc", "b1d89000"],
      transcriptsFound: true,
      notes:
        "Omitted: unified chat refactor, search combobox migration, performance quick-wins, PostHog, demo GUI, platform docs.",
    },
  },
  {
    id: "2026-07-06-manage-ai-usage-and-limits",
    audience: "staff",
    title: "Manage AI usage and limits",
    publishedAt: "2026-07-06",
    summary:
      "Set per-person AI allowances, review usage trends, and troubleshoot failures from clearer admin screens.",
    bullets: [
      "Set a monthly AI allowance for individual staff from their profile.",
      "Configure a school-wide default limit in organization AI settings.",
      "Usage analytics show daily activity, monthly trends, and top users at a glance.",
      "The AI failures list is easier to read, with one-click copy of details as markdown.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      {
        label: "Organization AI usage",
        href: "/organizations/profile?section=ai&pane=usage",
      },
      { label: "Staff profile — AI", href: "/users/1?section=ai" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-06-manage-ai-usage-and-limits/ai-usage.png",
        alt: "Organization AI usage analytics with charts",
        caption: "Review AI activity and set limits from organization and staff profiles.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-06T17:15:00+06:30",
      summarizedCommits: { fe: "b94e5c5", be: "e157cc2" },
      sinceCommits: { fe: "48b4a688", be: "d7ab8a3" },
      commitRefs: [
        "ce11292d",
        "7ed352f",
        "292f5f2",
        "57e4c0c",
        "d31af7e2",
        "cb8a1635",
      ],
      transcriptsFound: true,
      notes:
        "Omitted: capability-gap judge truncation, Telegram roster intent routing, unified chat refactor.",
    },
  },
  {
    id: "2026-07-06-assign-roles-to-many-staff",
    audience: "staff",
    title: "Assign roles to many staff at once",
    publishedAt: "2026-07-06",
    summary:
      "Grant the same role to multiple staff from a new Assign tab on Roles & Permissions.",
    bullets: [
      "Open the Assign tab to search and select several staff members.",
      "Pick a role, review the list, and confirm in one step.",
      "Staff search loads results as you type so large schools stay manageable.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Roles & Permissions", href: "/administration/roles" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-06-assign-roles-to-many-staff/role-assign.png",
        alt: "Roles & Permissions Assign tab with staff search",
        caption: "Search staff, pick a role, and assign it to many people at once.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-06T17:15:00+06:30",
      summarizedCommits: { fe: "b94e5c5", be: "e157cc2" },
      sinceCommits: { fe: "48b4a688", be: "d7ab8a3" },
      commitRefs: ["98247a42", "8eef8aa", "36d07148"],
      transcriptsFound: true,
      notes: "Omitted: search combobox primitive migration (shared UI polish).",
    },
  },
  {
    id: "2026-07-06-staff-certifications-and-public-profiles",
    audience: "everyone",
    title: "Staff certifications and public profiles",
    publishedAt: "2026-07-06",
    summary:
      "Staff can list certifications on their profile, turn on a public page, and share a link anyone can view.",
    bullets: [
      "Add certifications with title, issuer, dates, and supporting documents on staff profiles.",
      "Toggle public profile visibility and preview how your page will look before publishing.",
      "Anyone with the link can view a staff member’s public page at /people/{slug}.",
      "Public pages show qualifications and certifications alongside a profile photo.",
    ],
    categories: ["feature"],
    affectedAreas: [
      {
        label: "Staff profile — Certifications",
        href: "/users/1?section=certifications",
      },
      { label: "Public staff profile", href: "/people" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-06-staff-certifications-and-public-profiles/certifications.png",
        alt: "Staff certifications section with public profile settings",
        caption: "Manage certifications and publish a shareable public profile.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-06T17:15:00+06:30",
      summarizedCommits: { fe: "b94e5c5", be: "e157cc2" },
      sinceCommits: { fe: "48b4a688", be: "d7ab8a3" },
      commitRefs: ["e160e754", "b593a4c", "7bd78167"],
      transcriptsFound: true,
      notes:
        "Replaces legacy /teachers/{slug} route with unified /people/{slug}.",
    },
  },
  {
    id: "2026-07-06-fix-overlapping-class-sessions",
    audience: "staff",
    title: "Fix overlapping class sessions",
    publishedAt: "2026-07-06",
    summary:
      "Spot classes with conflicting session times and resolve overlaps from Course Data Health or the schedule editor.",
    bullets: [
      "Course Data Health flags overlapping sessions and opens a preview before applying a fix.",
      "The schedule calendar offers a one-click resolve when two sessions clash.",
      "New overlapping sessions are blocked when you edit the course schedule.",
    ],
    categories: ["feature", "fix"],
    affectedAreas: [
      {
        label: "Course data health",
        href: "/shortcuts/course-insights",
      },
      { label: "Course schedule", href: "/courses/96/schedule" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-06-fix-overlapping-class-sessions/course-data-health.png",
        alt: "Course data health with overlapping sessions fix",
        caption: "Find overlapping sessions and fix them without leaving the shortcut.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-06T17:15:00+06:30",
      summarizedCommits: { fe: "b94e5c5", be: "e157cc2" },
      sinceCommits: { fe: "48b4a688", be: "d7ab8a3" },
      commitRefs: ["2a50db13", "8b5a2a12", "724d5bc", "25e510b", "bbb40372"],
      transcriptsFound: true,
      notes: "Omitted: performance quick-wins and unrelated data-health bug fixes.",
    },
  },
  {
    id: "2026-07-06-attendance-and-payroll-improvements",
    audience: "staff",
    title: "Attendance and payroll improvements",
    publishedAt: "2026-07-06",
    summary:
      "Review attendance more reliably—including removed students—and see session payroll grouped by course.",
    bullets: [
      "Toggle to include removed students on the course attendance matrix when you have permission.",
      "Session-based payroll can group earnings by course for a clearer breakdown.",
      "Fixed timezone issues when marking attendance in different regions.",
      "Session check-in windows behave more predictably for teachers and students.",
    ],
    categories: ["improvement", "fix"],
    affectedAreas: [
      { label: "Course attendance", href: "/courses/96/attendance" },
      { label: "Payroll", href: "/finances/payroll" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-06-attendance-and-payroll-improvements/attendance.png",
        alt: "Course attendance matrix with include removed students toggle",
        caption: "Include removed students and review monthly attendance with fewer surprises.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-06T17:15:00+06:30",
      summarizedCommits: { fe: "b94e5c5", be: "e157cc2" },
      sinceCommits: { fe: "48b4a688", be: "d7ab8a3" },
      commitRefs: ["35d4a18d", "ddf5a02", "01ef973b", "f096bdd0"],
      transcriptsFound: true,
      notes:
        "Covers previously omitted attendance reliability work from the July 1–2 changelog batch.",
    },
  },
  {
    id: "2026-07-06-check-in-history-and-import-fixes",
    audience: "staff",
    title: "Check-in history and import fixes",
    publishedAt: "2026-07-06",
    summary:
      "Check-in history saves as you work, new user IDs assign automatically, and imports handle welcome emails more clearly.",
    bullets: [
      "Check-in history rows save automatically once both in and out times are set.",
      "Leave User ID blank when creating someone new and the system assigns the next available ID.",
      "Import onboarding includes a welcome-email toggle and clearer default-password handling.",
    ],
    categories: ["improvement", "fix"],
    affectedAreas: [
      { label: "Check-in histories", href: "/finances/checkin-histories" },
      { label: "Data imports", href: "/imports" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-06-check-in-history-and-import-fixes/checkin-histories.png",
        alt: "Check-in histories spreadsheet with autosaved times",
        caption: "Set in and out times and your edits save without an extra click.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-06T17:15:00+06:30",
      summarizedCommits: { fe: "b94e5c5", be: "e157cc2" },
      sinceCommits: { fe: "48b4a688", be: "d7ab8a3" },
      commitRefs: ["7a7e57db", "fc26833d", "7fdc3686", "e6ff4ce"],
      transcriptsFound: true,
      notes: "Omitted: legacy bulk-create endpoint removal (internal).",
    },
  },
  {
    id: "2026-07-02-clearer-student-signup-and-approval",
    audience: "everyone",
    title: "Clearer student signup and approval",
    publishedAt: "2026-07-02",
    summary:
      "Student self-signup and the admin approval queue are clearer and more reliable.",
    bullets: [
      "Students joining via a course link are sent through registration first, then returned to the join flow automatically.",
      "When self-signup is disabled for your school, the registration page explains why and links back to login.",
      "Pending accounts get clearer messaging instead of confusing “email already in use” errors.",
      "The admin approval queue shows which course each student requested, and approving enrolls them in those courses.",
    ],
    categories: ["fix", "improvement"],
    affectedAreas: [
      { label: "Student registration", href: "/register" },
      { label: "Registration approvals", href: "/student-registration" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-02-clearer-student-signup-and-approval/registration.png",
        alt: "Student registration page with clear signup steps",
        caption: "A clearer path for students signing up on their own.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-03T12:00:00+00:00",
      summarizedCommits: { fe: "48b4a688", be: "d7ab8a3" },
      sinceCommits: { fe: "8bdc767c", be: "230ffd5" },
      commitRefs: ["1612909e", "68ba260"],
      transcriptsFound: true,
      notes:
        "Omitted: session check-in fixes, attendance reliability, discounts, intake payment plans, PostHog, demo GUI, platform docs admin, chat refactors.",
    },
  },
  {
    id: "2026-07-01-paste-students-and-manage-roster-faster",
    audience: "staff",
    title: "Paste students and manage roster faster",
    publishedAt: "2026-07-01",
    summary:
      "Add or remove many students from a course roster without the old bulk-add page.",
    bullets: [
      "Paste a list of student emails to resolve matches and add many students at once.",
      "Select multiple students and remove them in one confirmation step.",
      "Students tab includes a History view of join and remove events with who did what and when.",
      "Missing Microsoft links are flagged when you paste emails so you can fix them before adding.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Course students", href: "/courses/1/students" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-01-paste-students-and-manage-roster-faster/students-roster.png",
        alt: "Course students page with paste and bulk remove tools",
        caption: "Manage course rosters from one Students page.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-03T12:00:00+00:00",
      summarizedCommits: { fe: "48b4a688", be: "d7ab8a3" },
      sinceCommits: { fe: "8bdc767c", be: "230ffd5" },
      commitRefs: ["abbf59d5", "5507e45", "ab5dc72"],
      transcriptsFound: true,
      notes:
        "Omitted: session check-in fixes, attendance reliability, discounts, intake payment plans, PostHog, demo GUI, platform docs admin, chat refactors.",
    },
  },
  {
    id: "2026-07-01-spot-classes-with-missing-data",
    audience: "staff",
    title: "Spot classes with missing data",
    publishedAt: "2026-07-01",
    summary:
      "A new shortcut lists active courses missing schedule, roster, or session data so admins can fix them quickly.",
    bullets: [
      "Filter by issue type such as missing schedule, teachers, students, or stale session data.",
      "Search by course name or code to find a specific class.",
      "Summary counts show how many courses need attention at a glance.",
      "Each row links straight to the course so you can fix problems quickly.",
    ],
    categories: ["feature"],
    affectedAreas: [
      {
        label: "Course data health",
        href: "/shortcuts/course-insights",
      },
    ],
    screenshots: [
      {
        src: "/changelog/2026-07-01-spot-classes-with-missing-data/course-data-health.png",
        alt: "Course data health shortcut listing classes with missing data",
        caption: "Find and fix classes with incomplete setup data.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-03T12:00:00+00:00",
      summarizedCommits: { fe: "48b4a688", be: "d7ab8a3" },
      sinceCommits: { fe: "8bdc767c", be: "230ffd5" },
      commitRefs: ["abbf59d5", "5507e45"],
      transcriptsFound: true,
      notes:
        "Shares BE commit with enrollment entry. Omitted: session check-in fixes, attendance reliability, discounts, intake payment plans, PostHog, demo GUI, platform docs admin, chat refactors.",
    },
  },
  {
    id: "2026-06-29-enter-monthly-results-and-reports",
    audience: "staff",
    title: "Enter monthly results and reports",
    publishedAt: "2026-06-29",
    summary:
      "Enter monthly test scores in a spreadsheet-style sheet and generate per-student monthly reports.",
    bullets: [
      "New Results and Reports tabs under course Grading, alongside quizzes and assignments.",
      "Create a monthly result sheet, add named test columns, and enter scores with auto-computed grades.",
      "Generate report batches from a month’s sheet, then review and finalize per-student reports.",
      "Regenerate draft reports when sheet data changes without losing finalized reports.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Monthly results", href: "/courses/96/grading/results" },
      { label: "Grading reports", href: "/courses/96/grading/reports" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-29-enter-monthly-results-and-reports/monthly-results.png",
        alt: "Monthly results sheet under course grading",
        caption: "Enter test scores and generate monthly student reports.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-03T12:00:00+00:00",
      summarizedCommits: { fe: "48b4a688", be: "d7ab8a3" },
      sinceCommits: { fe: "8bdc767c", be: "230ffd5" },
      commitRefs: ["4d562650", "13eb37a"],
      transcriptsFound: true,
      notes:
        "Omitted: session check-in fixes, attendance reliability, discounts, intake payment plans, PostHog, demo GUI, platform docs admin, chat refactors.",
    },
  },
  {
    id: "2026-06-29-browse-step-by-step-help-articles",
    audience: "everyone",
    title: "Browse step-by-step help articles",
    publishedAt: "2026-06-29",
    summary:
      "A dedicated Help section with searchable articles, categories, and embedded video.",
    bullets: [
      "Browse help by category or search for a topic from the Help home page.",
      "Article pages include a table of contents and prev/next links within each category.",
      "Articles support embedded video for walkthrough-style guidance.",
      "Clearer loading and error states when documentation fails to load.",
    ],
    categories: ["feature"],
    affectedAreas: [{ label: "Help center", href: "/help" }],
    screenshots: [
      {
        src: "/changelog/2026-06-29-browse-step-by-step-help-articles/help-center.png",
        alt: "Help center home with category cards and search",
        caption: "Find step-by-step guides in the Help section.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-07-03T12:00:00+00:00",
      summarizedCommits: { fe: "48b4a688", be: "d7ab8a3" },
      sinceCommits: { fe: "8bdc767c", be: "230ffd5" },
      commitRefs: ["9657dc28", "06a77fa4", "4aafa11e", "93590ee"],
      transcriptsFound: true,
      notes:
        "Omitted: session check-in fixes, attendance reliability, discounts, intake payment plans, PostHog, demo GUI, platform docs admin (authoring), chat refactors.",
    },
  },
  {
    id: "2026-06-28-course-attendance-at-a-glance",
    audience: "staff",
    title: "Course attendance at a glance",
    publishedAt: "2026-06-28",
    summary:
      "The course attendance page opens to the current month with a clearer matrix so you can spot patterns and jump to marking faster.",
    bullets: [
      "Opens to the current calendar month instead of loading every session at once.",
      "Today’s session column is highlighted when you are viewing the current month.",
      "Search for a student by name or ID in the attendance matrix.",
      "Mark attendance button takes you straight to the session you need.",
    ],
    categories: ["improvement"],
    affectedAreas: [
      { label: "Course attendance", href: "/courses/96/attendance" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-course-attendance-at-a-glance/attendance-dashboard.png",
        alt: "Course attendance matrix with month picker and student search",
        caption:
          "Review monthly attendance and jump to marking from one page.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T19:30:00+00:00",
      summarizedCommits: { fe: "8bdc767c", be: "230ffd5" },
      sinceCommits: { fe: "aab0558", be: "2746fb7" },
      commitRefs: [
        "8bdc767c",
        "da53772b",
        "230ffd5",
      ],
      transcriptsFound: true,
      notes:
        "Dashboard reskin includes uncommitted WIP. Omitted: stagger sound, docs/plans, AI request-log plumbing.",
    },
  },
  {
    id: "2026-06-28-redesigned-mark-attendance",
    audience: "staff",
    title: "Redesigned mark attendance page",
    publishedAt: "2026-06-28",
    summary:
      "Teachers get a cleaner mark-attendance page with a teaching-day calendar, a simpler roster table, and smoother loading while sessions load.",
    bullets: [
      "Pick a teaching day from a month calendar instead of the old date controls.",
      "Roster table is easier to scan on desktop and stacks neatly on phones.",
      "Mark-all, undo, and save status sit in a flat toolbar that stays visible as you scroll.",
      "Loading placeholders match the final layout so the page feels less jumpy on first open.",
    ],
    categories: ["improvement"],
    affectedAreas: [
      {
        label: "Mark attendance",
        href: "/courses/96/attendance/marking/today",
      },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-redesigned-mark-attendance/marking-page.png",
        alt: "Mark attendance page with teaching-day calendar and roster table",
        caption:
          "Mark attendance with a calendar picker and a cleaner roster layout.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T19:30:00+00:00",
      summarizedCommits: { fe: "8bdc767c", be: "230ffd5" },
      sinceCommits: { fe: "aab0558", be: "2746fb7" },
      commitRefs: [
        "8bdc767c",
        "b6b5f9b8",
        "f5a1d47d",
        "b4541231",
        "a7bdd689",
        "0148ec9c",
        "3bdc0da1",
      ],
      transcriptsFound: true,
      notes:
        "Includes uncommitted skeleton polish and staged BE marking services. Omitted: stagger sound.",
    },
  },
  {
    id: "2026-06-28-see-who-oversees-each-course",
    audience: "staff",
    title: "See who oversees each course",
    publishedAt: "2026-06-28",
    summary:
      "Managers can be assigned oversight over specific courses, and course pages show who is responsible at a glance.",
    bullets: [
      "Assign which courses a manager can oversee from their profile Access section.",
      "Course Members lists overseers with a link to each person’s profile.",
      "Students enrolled in a course have a dedicated Students tab on the course page.",
      "Course lists on busy profiles load faster and sort more predictably.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Course members", href: "/courses/96/members" },
      { label: "Staff profile — Access", href: "/users/1?section=access" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-see-who-oversees-each-course/course-oversight.png",
        alt: "Course members page showing course overseers",
        caption: "See who oversees a course from the Members page.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T19:30:00+00:00",
      summarizedCommits: { fe: "8bdc767c", be: "230ffd5" },
      sinceCommits: { fe: "aab0558", be: "2746fb7" },
      commitRefs: ["6cf98b77", "230ffd5"],
      transcriptsFound: true,
      notes:
        "Omitted: Microsoft scope-team sync internals, AI request-log plumbing.",
    },
  },
  {
    id: "2026-06-28-browse-course-updates-by-month",
    audience: "everyone",
    title: "Browse course updates by month",
    publishedAt: "2026-06-28",
    summary:
      "The course feed on Overview is easier to browse month by month, with clearer attachments and a heads-up when you might duplicate a daily lesson.",
    bullets: [
      "Move through feed posts month by month with previous and next controls.",
      "Posts show clearer timestamps so you know when something was shared.",
      "Attachment previews are easier to scan before opening a file.",
      "You get a warning if you try to post the same daily lesson twice for one day.",
    ],
    categories: ["improvement"],
    affectedAreas: [
      { label: "Course overview", href: "/courses/139" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-browse-course-updates-by-month/feed-month-toolbar.png",
        alt: "Course feed with month navigation toolbar",
        caption: "Browse announcements and lesson updates month by month.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T19:30:00+00:00",
      summarizedCommits: { fe: "8bdc767c", be: "2746fb7" },
      sinceCommits: { fe: "aab0558", be: "2746fb7" },
      commitRefs: ["4b6899b8"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-06-28-account-settings-on-profile",
    audience: "everyone",
    title: "Account settings on your profile",
    publishedAt: "2026-06-28",
    summary:
      "Theme, interface sounds, and password changes now live on your profile instead of a separate settings area.",
    bullets: [
      "Switch light or dark theme and adjust interface sound volume from your profile.",
      "Change your password without leaving your profile page.",
      "Settings use the same layout as the rest of the app for a consistent feel.",
      "Account menu links take you straight to the right settings section.",
    ],
    categories: ["improvement"],
    affectedAreas: [
      { label: "Your profile — Settings", href: "/users/1?section=settings" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-account-settings-on-profile/account-settings.png",
        alt: "User profile settings with appearance options",
        caption: "Manage theme and password from your profile.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T19:30:00+00:00",
      summarizedCommits: { fe: "8bdc767c", be: "2746fb7" },
      sinceCommits: { fe: "aab0558", be: "2746fb7" },
      commitRefs: ["6cf98b77"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-06-28-track-and-adjust-staff-points",
    audience: "staff",
    title: "Track and adjust staff points",
    publishedAt: "2026-06-28",
    summary:
      "Schools with Staff Points enabled get a ledger to view balances and record adjustments from one place.",
    bullets: [
      "New Points page in the sidebar when your school turns on Staff Points.",
      "Searchable staff sheet shows each person’s balance at a glance.",
      "Record adjustments with a reason and point type from the sheet or a staff profile.",
      "Configure point types and rules from Points settings.",
      "Points panel on staff profiles shows balance history for that person.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Staff points", href: "/points" },
      { label: "Points settings", href: "/points/settings" },
      { label: "Staff profile", href: "/users/1?section=points" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-track-and-adjust-staff-points/points-ledger.png",
        alt: "Staff points ledger with searchable balances",
        caption: "View and search staff point balances from one sheet.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T09:15:00+00:00",
      summarizedCommits: { fe: "aab0558", be: "2746fb7" },
      sinceCommits: { fe: "190076b", be: "cfcea0f" },
      commitRefs: ["413036bc", "c04cb55"],
      transcriptsFound: true,
      notes:
        "Omitted: Telegram bot, cron health, demo artifacts, token caching, org-record WIP.",
    },
  },
  {
    id: "2026-06-28-check-in-at-campus",
    audience: "staff",
    title: "Check in at campus with photo and location",
    publishedAt: "2026-06-28",
    summary:
      "Staff can check in or out at a campus using their device camera and location when your school requires it.",
    bullets: [
      "Check-in and check-out buttons on the campus check-in page.",
      "Take a live photo or upload one when your school requires a headshot.",
      "Location is verified automatically when geofencing is enabled.",
      "Checkout uses the same flow so arrival and departure are both recorded.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Campus check-in", href: "/services/campus-checkin" },
      { label: "Check-in history", href: "/services/campus-checkins" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-check-in-at-campus/campus-checkin.png",
        alt: "Campus check-in page with check-in button",
        caption: "Check in or out at campus from one page.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T09:15:00+00:00",
      summarizedCommits: { fe: "aab0558", be: "2746fb7" },
      sinceCommits: { fe: "190076b", be: "cfcea0f" },
      commitRefs: ["b00f7f9e", "4c4659d"],
      transcriptsFound: true,
      notes:
        "Omitted: Telegram bot, cron health, demo artifacts, token caching, org-record WIP.",
    },
  },
  {
    id: "2026-06-28-course-feed-on-overview",
    audience: "staff",
    title: "Share updates on the course feed",
    publishedAt: "2026-06-28",
    summary:
      "Course Overview now has a live feed for announcements, daily lessons, and attachments — replacing the old separate Announcements page.",
    bullets: [
      "Post announcements or daily lesson updates with attachments directly on Overview.",
      "Edit or remove your own posts from the feed.",
      "Teachers and enrolled students see the same feed on the course Overview page.",
      "Daily lesson posts can include which unit you finished.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Course overview", href: "/courses/139" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-course-feed-on-overview/course-feed.png",
        alt: "Course overview with a feed composer and posts",
        caption:
          "Share announcements and lesson updates on the course Overview feed.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T09:15:00+00:00",
      summarizedCommits: { fe: "aab0558", be: "2746fb7" },
      sinceCommits: { fe: "190076b", be: "cfcea0f" },
      commitRefs: ["bd77702f", "1c707707"],
      transcriptsFound: true,
      notes:
        "Omitted: Telegram bot, cron health, demo artifacts, token caching, org-record WIP.",
    },
  },
  {
    id: "2026-06-28-find-courses-on-user-profiles",
    audience: "staff",
    title: "Find courses faster on user profiles",
    publishedAt: "2026-06-28",
    summary:
      "Search and filter courses directly on someone’s Academic section without scrolling long lists.",
    bullets: [
      "Search box filters courses by title, code, subject, level, or section.",
      "Scope and status filters narrow enrolled vs teaching courses.",
      "Large course lists load faster on busy profiles.",
      "Fixed miscounts when viewing how many courses someone teaches or takes.",
    ],
    categories: ["feature", "improvement", "fix"],
    affectedAreas: [
      { label: "User profile — Academic", href: "/users/1?section=academic" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-find-courses-on-user-profiles/profile-course-search.png",
        alt: "User profile Academic section with course search",
        caption: "Search and filter courses without scrolling long lists.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T09:15:00+00:00",
      summarizedCommits: { fe: "aab0558", be: "2746fb7" },
      sinceCommits: { fe: "190076b", be: "cfcea0f" },
      commitRefs: ["cdb87f8e", "02efbe8", "e744f717"],
      transcriptsFound: true,
      notes:
        "Omitted: Telegram bot, cron health, demo artifacts, token caching, org-record WIP.",
    },
  },
  {
    id: "2026-06-28-spot-missing-attendance-faster",
    audience: "staff",
    title: "Spot missing attendance faster",
    publishedAt: "2026-06-28",
    summary:
      "The attendance overview helps managers find classes that haven’t been marked and undo accidental “mark all present.”",
    bullets: [
      "New Course marking gaps view lists classes below your completion threshold.",
      "Clear optional filters in one click when views feel too narrow.",
      "Undo mark all present right after bulk-marking a session.",
      "Smoother flow when moving between teaching days while marking.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      {
        label: "Attendance overview",
        href: "/attendances/god-view?mode=course_marking_gaps",
      },
      {
        label: "Attendance marking",
        href: "/courses/139/attendance/marking/today",
      },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-spot-missing-attendance-faster/marking-gaps.png",
        alt: "Attendance overview showing course marking gaps",
        caption:
          "Find classes that still need attendance marked for the selected period.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T09:15:00+00:00",
      summarizedCommits: { fe: "aab0558", be: "2746fb7" },
      sinceCommits: { fe: "190076b", be: "cfcea0f" },
      commitRefs: ["39733877", "bd77702f", "7f4b5a1", "0d1a5d3"],
      transcriptsFound: true,
      notes:
        "Omitted: Telegram bot, cron health, demo artifacts, token caching, org-record WIP.",
    },
  },
  {
    id: "2026-06-28-id-cards-and-payment-clarity",
    audience: "staff",
    title: "Class names on ID cards and clearer payment status",
    publishedAt: "2026-06-28",
    summary:
      "Student ID cards can show class or course info, and student payment views reflect status more accurately.",
    bullets: [
      "Optional class line on printed ID cards, editable per student in data sheets.",
      "Preview how the class line looks in ID card settings before printing.",
      "Payment status labels in finance views are easier to read.",
      "Removed a misleading fully-paid flag that no longer matched how payments work.",
    ],
    categories: ["feature", "improvement", "fix"],
    affectedAreas: [
      { label: "ID card settings", href: "/organizations/profile?section=id-cards" },
      { label: "Student payments", href: "/finances/student-payments" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-28-id-cards-and-payment-clarity/id-card-settings.png",
        alt: "ID card settings with live preview",
        caption: "Preview how class names appear on student ID cards.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-28T09:15:00+00:00",
      summarizedCommits: { fe: "aab0558", be: "2746fb7" },
      sinceCommits: { fe: "190076b", be: "cfcea0f" },
      commitRefs: ["b39a270b", "76c7490", "5c1ed6e7", "e0a6c3ac", "2f270c4"],
      transcriptsFound: true,
      notes:
        "Omitted: Telegram bot, cron health, demo artifacts, token caching, org-record WIP.",
    },
  },
  {
    id: "2026-06-24-navigate-courses-with-sidebar",
    audience: "staff",
    title: "Navigate courses with a persistent sidebar",
    publishedAt: "2026-06-24",
    summary:
      "Opening a class now keeps a section sidebar visible so you can move between Overview, Schedule, Attendance, and Grading without losing context.",
    bullets: [
      "Persistent section sidebar on all course pages (Overview → Schedule → Attendance → Grading → Members → …), matching the user profile layout.",
      "Redesigned course header with program breadcrumb, title, and status chips; course status actions move behind the status badge for managers.",
      "Attendance and Grading are promoted in the sidebar instead of buried in a “More” menu.",
      "Staff tools (Edit, Payments, Notes, etc.) stay in the header overflow menu.",
      "Fixed sidebar links so left-click navigation works reliably between sections.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Classes", href: "/courses" },
      { label: "Course overview", href: "/courses/139" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-24-navigate-courses-with-sidebar/course-overview.png",
        alt: "Course page with a persistent section sidebar and redesigned header",
        caption:
          "Move between Overview, Schedule, Attendance, and Grading without losing course context.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-24T05:24:23+00:00",
      summarizedCommits: { fe: "190076b", be: "cfcea0f" },
      sinceCommits: { fe: "0239861", be: "99815b4" },
      commitRefs: ["190076b"],
      transcriptsFound: true,
      notes:
        "Course record shell is uncommitted WIP; payment assignment BE refactor (532d036) omitted.",
    },
  },
  {
    id: "2026-06-24-attendance-and-appearance-fixes",
    audience: "staff",
    title: "Easier attendance marking and smoother themes",
    publishedAt: "2026-06-24",
    summary:
      "Marking attendance is easier to navigate and less likely to lose your work, and light/dark mode no longer flashes the wrong colors on load.",
    bullets: [
      "Day picker calendar replaces the old session dropdown when moving between teaching days.",
      "Opening “today’s” session lands on the right day automatically.",
      "Unsaved attendance edits flush when you navigate away so marks aren’t dropped mid-save.",
      "Saving only the fields you changed is more reliable.",
      "Fixed a flash of the wrong theme when pages first load.",
      "Appearance settings and saved preference now stay aligned across tabs and reloads.",
    ],
    categories: ["improvement", "fix"],
    affectedAreas: [
      {
        label: "Attendance marking",
        href: "/courses/139/attendance/marking/today",
      },
      { label: "Appearance settings", href: "/users/1?section=settings&pane=appearance" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-24-attendance-and-appearance-fixes/attendance-marking.png",
        alt: "Attendance marking page with a day picker calendar",
        caption:
          "Pick teaching days from a calendar and jump straight to today’s session.",
      },
      {
        src: "/changelog/2026-06-24-attendance-and-appearance-fixes/appearance-settings.png",
        alt: "Appearance settings with light and dark mode controls",
        caption:
          "Theme preference stays in sync without flashing the wrong colors on load.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-24T05:24:23+00:00",
      summarizedCommits: { fe: "190076b", be: "cfcea0f" },
      sinceCommits: { fe: "0239861", be: "99815b4" },
      commitRefs: ["190076b", "ce748bd", "5d52a93", "cfcea0f"],
      transcriptsFound: true,
      notes:
        "Attendance keepalive + BE partial bulk update are uncommitted; 532d036 payment assignment omitted.",
    },
  },
  {
    id: "2026-06-23-preview-id-cards-in-data-sheets",
    audience: "staff",
    title: "Preview ID cards while editing data sheets",
    publishedAt: "2026-06-23",
    summary:
      "When you open someone’s ID photo from Student or Staff Data, you now see a live ID card preview that updates as you edit the row — plus faster photo thumbnails in the grid.",
    bullets: [
      "Open an ID photo from Student Data or Staff Data to see a full ID card preview above the headshot.",
      "The preview updates immediately as you change name, blood type, or other card fields — even before changes are saved.",
      "ID photo thumbnails load faster in large sheets thanks to pre-generated smaller images.",
      "The headshot section below the card is unchanged for checking photo quality.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Student Data", href: "/shortcuts/student-data" },
      { label: "Staff Data", href: "/shortcuts/staff-data" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-23-preview-id-cards-in-data-sheets/id-card-preview.png",
        alt: "ID photo panel showing a live ID card preview above the headshot",
        caption:
          "See how the finished ID card will look while you edit student or staff details.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-23T07:47:42+00:00",
      summarizedCommits: { fe: "0239861", be: "99815b4" },
      sinceCommits: { fe: "680ca14", be: "c49a8d6" },
      commitRefs: ["0239861", "99815b4", "ee0c8fb"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-06-23-faster-student-and-staff-data",
    audience: "staff",
    title: "Faster Student and Staff Data sheets",
    publishedAt: "2026-06-23",
    summary:
      "Student Data loads more reliably, saves edits as you work, and both student and staff sheets feel snappier with large rosters.",
    bullets: [
      "Student Data now autosaves cell edits so you don’t lose work mid-session.",
      "Fixed an issue where Student Data could fail to load row data correctly.",
      "Large sheets open faster, including quicker ID photo thumbnails and improved people search behind the scenes.",
      "Custom field editing and save indicators received small layout fixes.",
    ],
    categories: ["improvement", "fix"],
    affectedAreas: [
      { label: "Student Data", href: "/shortcuts/student-data" },
      { label: "Staff Data", href: "/shortcuts/staff-data" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-23-faster-student-and-staff-data/student-data.png",
        alt: "Student Data spreadsheet with rows loaded",
        caption:
          "Student Data opens faster and saves your edits as you work through the roster.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-23T07:47:42+00:00",
      summarizedCommits: { fe: "0239861", be: "99815b4" },
      sinceCommits: { fe: "680ca14", be: "c49a8d6" },
      commitRefs: [
        "e3344c4",
        "124fd28",
        "16ebbd9",
        "ee0c8fb",
        "d1af1b5",
        "5cb7314",
      ],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-06-23-academic-hub-toolbar-refresh",
    audience: "staff",
    title: "Academic Hub toolbar matches Users",
    publishedAt: "2026-06-23",
    summary:
      "The Classes page now uses the same sticky header and segmented toolbar pattern as Users, with filters grouped into primary and secondary rows.",
    bullets: [
      "Program, status, search, and “My classes only” sit in a compact toolbar row under the page title.",
      "Intake, subject, and category filters move to a second row when your program needs them.",
      "“Add classes” sits with other page actions in the header, consistent with Users.",
    ],
    categories: ["improvement"],
    affectedAreas: [{ label: "Classes", href: "/courses" }],
    screenshots: [
      {
        src: "/changelog/2026-06-23-academic-hub-toolbar-refresh/academic-hub-toolbar.png",
        alt: "Academic Hub page with compact toolbar rows under the header",
        caption:
          "Filters and actions now match the same header pattern as the Users page.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-23T07:47:42+00:00",
      summarizedCommits: { fe: "0239861", be: "99815b4" },
      sinceCommits: { fe: "680ca14", be: "c49a8d6" },
      commitRefs: ["0239861"],
      transcriptsFound: true,
      notes: "ed426b7 docker fixes omitted from user-facing bullets.",
    },
  },
  {
    id: "2026-06-23-find-any-page-quickly",
    audience: "staff",
    title: "Find any page quickly",
    publishedAt: "2026-06-23",
    summary:
      "Jump to any screen or shortcut tool from a search tab at the top of the page — no need to hunt the sidebar.",
    bullets: [
      "Click find a page at the top of your screen to search sidebar pages and shortcut tools you have access to.",
      "Use Tips beside the tab to replay the welcome guide and coachmark anytime.",
      "Press ⌘K on a Mac or Ctrl+K on Windows as a secondary shortcut once you know where the search tab lives.",
      "Results are grouped into Pages and Shortcuts with plain descriptions.",
    ],
    categories: ["feature"],
    affectedAreas: [{ label: "Home", href: "/home" }],
    screenshots: [
      {
        src: "/changelog/2026-06-23-find-any-page-quickly/find-page-notch.png",
        alt: "find a page tab docked at the top center of the home screen",
        caption:
          "The find a page tab stays visible at the top so you can open search with a click.",
      },
      {
        src: "/changelog/2026-06-23-find-any-page-quickly/find-page-open.png",
        alt: "Find a page search open with Pages and Shortcuts grouped",
        caption:
          "Type to filter pages and shortcut tools; press Enter to jump there.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-23T08:30:00+06:30",
      summarizedCommits: { fe: "680ca14", be: "c49a8d6" },
      sinceCommits: { fe: "ab9390b", be: "242bc94" },
      commitRefs: ["680ca14"],
      transcriptsFound: true,
      notes:
        "Includes uncommitted find-page implementation (dynamic island notch). Design spec at 2026-06-23-find-page-navigation-design.md.",
    },
  },
  {
    id: "2026-06-23-clearer-course-data-sheet",
    audience: "staff",
    title: "Clearer Course Data sheet",
    publishedAt: "2026-06-23",
    summary:
      "Course Data now shows weekday and weekend classes side by side with summary totals, making enrollment easier to scan.",
    bullets: [
      "View classes in paired columns (weekday vs weekend, or finer FM/HM splits when enabled).",
      "See per-block and grand totals at the bottom of each category section.",
      "Student counts show as clear at-ratio labels where applicable.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Course Data", href: "/shortcuts/course-data" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-23-clearer-course-data-sheet/course-data.png",
        alt: "Course Data spreadsheet with paired weekday and weekend columns",
        caption:
          "Classes appear side by side with summary totals for each block.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-23T08:30:00+06:30",
      summarizedCommits: { fe: "680ca14", be: "c49a8d6" },
      sinceCommits: { fe: "ab9390b", be: "242bc94" },
      commitRefs: ["60164f8", "856dafa", "680ca14", "c49a8d6"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-06-23-easier-logs-and-day-to-day-fixes",
    audience: "staff",
    title: "Easier log setup and day-to-day fixes",
    publishedAt: "2026-06-23",
    summary:
      "Log report types are easier to configure, and several fixes improve check-in, login activity, calendars, and spreadsheet shortcuts.",
    bullets: [
      "Add and reorder fields on log report types from a structured list instead of one long form.",
      "Open a side panel to edit each field’s type, label, and options, with inline validation before saving.",
      "Fixed an issue where the class check-in button could not be clicked.",
      "Login Activity lets you select multiple inactive accounts and disable them in bulk.",
      "Calendar views received layout and legend polish for easier reading.",
      "Student Data, Staff Data, and Course Data sheets received layout fixes in fullscreen mode.",
    ],
    categories: ["fix", "improvement"],
    affectedAreas: [
      { label: "Log settings", href: "/logs/settings" },
      {
        label: "Login activity",
        href: "/organizations/user-activity/login-activity",
      },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-23-easier-logs-and-day-to-day-fixes/log-settings.png",
        alt: "Log report types settings with a structured field list",
        caption:
          "Configure report types from a clear list; open a side panel to edit each field.",
      },
      {
        src: "/changelog/2026-06-23-easier-logs-and-day-to-day-fixes/login-activity.png",
        alt: "Login Activity page with inactive user selection",
        caption:
          "Select multiple inactive accounts and disable them in one action.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-23T08:30:00+06:30",
      summarizedCommits: { fe: "680ca14", be: "c49a8d6" },
      sinceCommits: { fe: "ab9390b", be: "242bc94" },
      commitRefs: ["f5bbf62", "856dafa", "60164f8", "680ca14"],
      transcriptsFound: true,
      notes:
        "Log field editor is incremental to 2026-06-22-user-logs-and-audit-trail.",
    },
  },
  {
    id: "2026-06-22-fresher-navigation-and-user-records",
    audience: "staff",
    title: "Fresher navigation and user records",
    publishedAt: "2026-06-22",
    summary:
      "A redesigned sidebar and user record pages make it easier to browse the app and manage students and staff in one place.",
    bullets: [
      "Navigate with a cleaner sidebar and floating main panel; switch light, dark, or system theme from the header.",
      "Open any user to see their profile, courses, and details in one place — edit name, contact info, and roles without leaving the page.",
      "Browse a student or staff member’s courses, schedule, assessments, and history from tabbed sections inside their record.",
      "Empty lists show friendly bilingual handwriting-style messages instead of blank space.",
      "Global navigation stays reachable while viewing a user record via breadcrumbs and sidebar icons.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Home", href: "/home" },
      { label: "Users", href: "/users" },
      { label: "User record", href: "/profile" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-22-fresher-navigation-and-user-records/home-shell.png",
        alt: "Home page with the new recessed sidebar and floating content panel",
        caption:
          "The updated shell keeps navigation visible while giving more room to your work.",
      },
      {
        src: "/changelog/2026-06-22-fresher-navigation-and-user-records/user-record-overview.png",
        alt: "User record overview with cover photo and inline profile fields",
        caption:
          "View and edit profile details directly on the Overview section.",
      },
      {
        src: "/changelog/2026-06-22-fresher-navigation-and-user-records/user-record-academic.png",
        alt: "User record Academic section with Courses, Schedule, Assessments, and History tabs",
        caption:
          "Switch between courses, schedule, assessments, and history without leaving the record.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-22T02:05:00+06:30",
      summarizedCommits: { fe: "ab9390b", be: "242bc94" },
      sinceCommits: { fe: "c7cdef3", be: "95371fa" },
      commitRefs: ["ab9390b", "bf8fdce"],
      transcriptsFound: true,
      notes:
        "Includes uncommitted app shell, user record, academic pane, empty-state, and record-mode nav work. Design-system /components gallery (superadmin-only) omitted. Leads board/table toggle from 30e2e79 omitted as incremental to the 2026-06-20 leads entry.",
    },
  },
  {
    id: "2026-06-22-student-and-staff-id-cards",
    audience: "everyone",
    title: "Student and staff ID cards",
    publishedAt: "2026-06-22",
    summary:
      "Preview your school ID badge on screen, download a PDF, and let anyone verify it with a QR code.",
    bullets: [
      "View your personal ID badge with a tilt effect and QR code on the My ID card page.",
      "Download your badge as a PDF for printing or sharing.",
      "School admins can customize card branding and export badges in bulk.",
      "Anyone can confirm a card is genuine by scanning the QR code or opening the verify link.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "My ID card", href: "/id-card" },
      { label: "Organization settings", href: "/organizations/profile?section=id-cards" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-22-student-and-staff-id-cards/id-card.png",
        alt: "Interactive school ID badge with QR code on the My ID card page",
        caption: "Move your cursor over the badge to preview it before downloading.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-22T02:05:00+06:30",
      summarizedCommits: { fe: "ab9390b", be: "242bc94" },
      sinceCommits: { fe: "c7cdef3", be: "95371fa" },
      commitRefs: ["bf8fdce"],
      transcriptsFound: true,
      notes:
        "Includes uncommitted ID card branding and blood-type fields on the backend.",
    },
  },
  {
    id: "2026-06-22-id-photos-in-spreadsheets",
    audience: "staff",
    title: "ID photos in Student and Staff Data",
    publishedAt: "2026-06-22",
    summary:
      "View and upload ID photos from spreadsheet shortcuts, and export photos in bulk when you need them.",
    bullets: [
      "Open an ID photo cell in Student Data to view, upload, or replace a student’s photo.",
      "Use the new Staff Data shortcut to browse staff in the same spreadsheet-style view.",
      "Export ID photos in bulk for printing or external systems.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Student Data", href: "/shortcuts/student-data" },
      { label: "Staff Data", href: "/shortcuts/staff-data" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-22-id-photos-in-spreadsheets/student-data.png",
        alt: "Student Data spreadsheet with ID photo column",
        caption: "Click a photo cell to view or update a student’s ID image.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-22T02:05:00+06:30",
      summarizedCommits: { fe: "ab9390b", be: "242bc94" },
      sinceCommits: { fe: "c7cdef3", be: "95371fa" },
      commitRefs: ["26a1318", "c9e62e8"],
      transcriptsFound: true,
      notes:
        "Staff Data shortcut and bulk photo export include uncommitted frontend and backend work.",
    },
  },
  {
    id: "2026-06-22-user-logs-and-audit-trail",
    audience: "staff",
    title: "User logs and audit trail",
    publishedAt: "2026-06-22",
    summary:
      "Keep structured notes and compliance reports on students and staff, with a full history of changes.",
    bullets: [
      "Browse users and open a side panel to view or add log entries for that person.",
      "Create entries using configurable report types with custom fields.",
      "Review an audit trail showing who changed each log entry and when.",
      "Configure report types and fields from Log settings.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Logs", href: "/logs" },
      { label: "Log settings", href: "/logs/settings" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-22-user-logs-and-audit-trail/logs.png",
        alt: "Logs page listing users with filters for student and staff roles",
        caption: "Select a user to open their log panel and add new entries.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-22T02:05:00+06:30",
      summarizedCommits: { fe: "ab9390b", be: "242bc94" },
      sinceCommits: { fe: "c7cdef3", be: "95371fa" },
      commitRefs: ["bf8fdce"],
      transcriptsFound: true,
      notes: "Backend user-log app includes uncommitted work.",
    },
  },
  {
    id: "2026-06-22-manage-program-intakes",
    audience: "staff",
    title: "Manage program intakes",
    publishedAt: "2026-06-22",
    summary:
      "Create and edit intakes so you can organize when students join a program.",
    bullets: [
      "Add and edit intakes from the intake detail page.",
      "Link intakes to programs and the courses that run in each intake period.",
    ],
    categories: ["feature"],
    affectedAreas: [{ label: "Intakes", href: "/intakes" }],
    screenshots: [
      {
        src: "/changelog/2026-06-22-manage-program-intakes/intakes.png",
        alt: "Intakes list showing program intake periods",
        caption: "Open an intake to edit its details and linked courses.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-22T02:05:00+06:30",
      summarizedCommits: { fe: "ab9390b", be: "242bc94" },
      sinceCommits: { fe: "c7cdef3", be: "95371fa" },
      commitRefs: ["7c6f8c9"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-06-22-richer-check-in-history",
    audience: "staff",
    title: "Richer check-in history",
    publishedAt: "2026-06-22",
    summary:
      "Check-in history now shows what students did today and any screenshots they uploaded.",
    bullets: [
      "See a Today’s activities column when reviewing per-event check-in history.",
      "View uploaded screenshot images alongside each check-in record.",
    ],
    categories: ["improvement"],
    affectedAreas: [
      { label: "Check-in histories", href: "/finances/checkin-histories" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-22-richer-check-in-history/checkin-histories.png",
        alt: "Check-in histories page listing past check-in events",
        caption:
          "Open an event to see today’s activities and uploaded screenshots for each student.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-22T02:05:00+06:30",
      summarizedCommits: { fe: "ab9390b", be: "242bc94" },
      sinceCommits: { fe: "c7cdef3", be: "95371fa" },
      commitRefs: ["a0a98a8"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-06-20-track-leads-from-inquiry-to-enrollment",
    audience: "staff",
    title: "Track leads from inquiry to enrollment",
    publishedAt: "2026-06-20",
    summary:
      "Manage prospective students on a drag-and-drop board, schedule appointments, and convert accepted leads into enrolled students.",
    bullets: [
      "View leads on a kanban board and drag cards between statuses as they progress.",
      "Add new leads with source, contact details, and notes.",
      "Schedule appointments with meeting platform and assigned staff.",
      "Convert a lead to an enrolled student when they are ready to join.",
      "Configure lead statuses and sources from CRM settings.",
    ],
    categories: ["feature"],
    affectedAreas: [
      { label: "Leads", href: "/crm/leads" },
      { label: "CRM settings", href: "/crm/leads/settings" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-20-track-leads-from-inquiry-to-enrollment/leads.png",
        alt: "Leads kanban board with status columns and lead cards",
        caption:
          "Drag leads between statuses and open a card to schedule appointments or convert to a student.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-20T12:00:00+06:30",
      summarizedCommits: { fe: "c7cdef3", be: "95371fa" },
      sinceCommits: { fe: "0b92d6c", be: "03214ec" },
      commitRefs: ["c7cdef3", "95371fa"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-06-20-send-voice-messages-in-chat",
    audience: "everyone",
    title: "Send voice messages in chat",
    publishedAt: "2026-06-20",
    summary:
      "Record and play voice messages in course chat and direct messages, alongside photos and files.",
    bullets: [
      "Tap and hold to record a voice message in course chat or a direct message.",
      "Play voice messages inline with a simple player control.",
      "Voice attachments work alongside existing photos and file uploads.",
    ],
    categories: ["feature"],
    affectedAreas: [{ label: "Home", href: "/home" }],
    screenshots: [
      {
        src: "/changelog/2026-06-20-send-voice-messages-in-chat/chat-voice.png",
        alt: "Course chat composer with voice record button",
        caption:
          "Hold the microphone button to record; release to send your voice message.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-20T12:00:00+06:30",
      summarizedCommits: { fe: "c7cdef3", be: "95371fa" },
      sinceCommits: { fe: "0b92d6c", be: "03214ec" },
      commitRefs: ["8eef719", "f4f292a"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-06-20-spreadsheet-shortcuts-and-smoother-editing",
    audience: "staff",
    title: "Spreadsheet shortcuts and smoother editing",
    publishedAt: "2026-06-20",
    summary:
      "Explore Student and Course Data in spreadsheet-style shortcuts, review payments in grid views, connect Telegram, and save edit forms automatically as you work.",
    bullets: [
      "Student Data and Course Data shortcuts behave like spreadsheets—sort, resize, reorder and hide columns, copy and paste cells, and click a course chip for a quick summary.",
      "Review student payments and recent transactions in grid views with a side panel for details.",
      "Link Telegram from your profile; schools can optionally send announcements to Telegram groups.",
      "Edit forms across courses, categories, users, and organization settings save automatically as you type, with clear status when something is still saving.",
      "Import wizard matches spreadsheet rows to existing users more reliably before you commit.",
      "Public profile settings no longer block role changes when the toggle is off; custom field order in the form designer saves correctly; reorder categories from the dedicated sort page.",
    ],
    categories: ["feature", "improvement", "fix"],
    affectedAreas: [
      { label: "Student Data", href: "/shortcuts/student-data" },
      { label: "Course Data", href: "/shortcuts/course-data" },
      { label: "Student payments", href: "/finances/student-payments" },
      { label: "Recent transactions", href: "/finances/recent-transactions" },
      { label: "Data imports", href: "/imports" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-20-spreadsheet-shortcuts-and-smoother-editing/student-data.png",
        alt: "Student Data shortcut showing spreadsheet grid with course chips",
        caption:
          "Sort columns, resize widths, and click a course chip for a quick summary.",
      },
      {
        src: "/changelog/2026-06-20-spreadsheet-shortcuts-and-smoother-editing/payments.png",
        alt: "Student payments page in spreadsheet grid view",
        caption:
          "Review payments in a grid with totals and quick access to details.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-20T12:00:00+06:30",
      summarizedCommits: { fe: "c7cdef3", be: "95371fa" },
      sinceCommits: { fe: "0b92d6c", be: "03214ec" },
      commitRefs: [
        "8922bd7",
        "cd7c461",
        "aecef92",
        "bbe4f4a",
        "de19e97",
        "9eaa75b",
        "44efdcb",
        "a4e2b5f",
        "2f51766",
        "9bcf5d5",
        "6d78a90",
        "3ee0c92",
        "2bb6fc2",
        "dafbd17",
        "2535b04",
        "cd76b20",
        "803a8e1",
      ],
      transcriptsFound: true,
      notes:
        "View-as debug tooling, RBAC catalog expansion, plan/docs files, and changelog capture script tweaks omitted as non–end-user.",
    },
  },
  {
    id: "2026-06-18-smarter-imports-and-course-scheduling",
    audience: "staff",
    title: "Faster repeat imports and clearer course scheduling rules",
    publishedAt: "2026-06-18",
    summary:
      "Re-importing familiar spreadsheets is quicker, the import grid is easier to edit, teachers can assign themselves to timeslots when allowed, and custom profile fields save more reliably.",
    bullets: [
      "Upload a spreadsheet you've imported before and your column mapping, role, and defaults come back automatically.",
      "Fix import rows with the right control for each field—pick dates from a calendar, choose from dropdowns, and show or hide columns as you review.",
      "Teachers can assign themselves to course timeslots when your school grants that permission; others stay read-only in the picker.",
      "Custom profile fields—especially dates—save correctly and completion reminders reflect what's actually filled in.",
    ],
    categories: ["feature", "improvement", "fix"],
    affectedAreas: [
      { label: "Data imports", href: "/imports" },
      { label: "Courses", href: "/courses" },
      { label: "User profiles", href: "/users" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-18-smarter-imports-and-course-scheduling/imports.png",
        alt: "Import wizard with spreadsheet grid and column controls",
        caption:
          "Re-use saved column mappings and edit cells with date pickers and dropdowns.",
      },
      {
        src: "/changelog/2026-06-18-smarter-imports-and-course-scheduling/courses.png",
        alt: "Course page with teacher assignment controls",
        caption:
          "Teachers can assign themselves to timeslots when your school allows it.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-18T12:00:00+06:30",
      summarizedCommits: { fe: "0b92d6c", be: "03214ec" },
      sinceCommits: { fe: "2119183", be: "7cfbab2" },
      commitRefs: ["0b92d6c", "03214ec"],
      transcriptsFound: true,
      notes:
        "View-as debugging, changelog UI, and platform org RBAC omitted as non–end-user. Payroll/resignation/rates omitted as duplicate of 2026-06-17 entry. Includes uncommitted FE import/profile work.",
    },
  },
  {
    id: "2026-06-17-imports-payroll-and-staff-hr",
    audience: "staff",
    title: "Smoother imports, session-based payroll, and staff HR tools",
    publishedAt: "2026-06-17",
    summary:
      "Import spreadsheets are easier to review, finance pages follow permissions more closely, schools can run per-session payroll, and you can record staff resignations.",
    bullets: [
      "The import wizard grid is easier to work with—delete rows without losing track of validation errors, and review fixes before you commit.",
      "Student payments, payment uploads, and recent transactions now show only for people with the right access; teachers can record payments when your school allows it.",
      "Schools can choose session-based payroll: set a per-session rate on staff profiles and calculate pay from checked-in teaching sessions.",
      "The rates editor and Home earnings widget automatically match your school's payroll method (hourly or per-session).",
      "Mark staff as resigned from their profile with inform date, last working day, and pay details—their account is disabled and the profile shows their status.",
    ],
    categories: ["feature", "improvement", "fix"],
    affectedAreas: [
      { label: "Data imports", href: "/imports" },
      { label: "Payroll", href: "/finances/payroll" },
      { label: "Staff rates", href: "/finances/rates" },
      { label: "Home", href: "/home" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-17-imports-payroll-and-staff-hr/imports.png",
        alt: "Data imports page listing import jobs",
        caption:
          "Review and fix spreadsheet rows in the import wizard before committing.",
      },
      {
        src: "/changelog/2026-06-17-imports-payroll-and-staff-hr/payroll.png",
        alt: "Payroll page with session-based earnings breakdown",
        caption:
          "Calculate staff pay from checked-in sessions when your school uses session-based payroll.",
      },
      {
        src: "/changelog/2026-06-17-imports-payroll-and-staff-hr/rates.png",
        alt: "Staff rates editor with editable rate columns",
        caption:
          "Edit hourly or per-session rates in a spreadsheet-style grid.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-17T14:00:00+06:30",
      summarizedCommits: { fe: "2119183", be: "7cfbab2" },
      sinceCommits: { fe: "fd8ff14", be: "da55cb8" },
      commitRefs: [
        "2119183",
        "cef529d",
        "aef136b",
        "473d480",
        "96f928d",
        "1ca8e23",
        "7cfbab2",
        "eea2ef6",
        "b999531",
        "a418fa9",
        "cc32fc6",
        "e71669e",
        "520ee37",
        "781e369",
      ],
      transcriptsFound: true,
      notes:
        "Includes uncommitted payroll/resignation/rates work; gen-AI and SDEC import command omitted as internal.",
    },
  },
  {
    id: "2026-06-17-roles-and-permissions",
    audience: "staff",
    title: "Manage roles and who can do what",
    publishedAt: "2026-06-17",
    summary:
      "School admins can now review and adjust permissions in one place, and the app respects those rules in menus, pages, and actions.",
    bullets: [
      "Open Roles & Permissions to edit the permission matrix or read a plain-language policy summary for each role.",
      "Assign roles to staff from user profiles so access stays accurate as your team changes.",
      "Menus, pages, and buttons now follow permissions—not just job titles—so people only see what they should.",
      "Access checks are enforced consistently across the product, not only in the browser.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Roles & Permissions", href: "/administration/roles" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-17-roles-and-permissions/overview.png",
        alt: "Roles & Permissions page with permission matrix editor",
        caption:
          "Edit the matrix or switch to Policy Overview for a readable summary of each role.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-17T12:00:00+06:30",
      summarizedCommits: { fe: "fd8ff14", be: "da55cb8" },
      sinceCommits: { fe: "51ba784", be: "6c98d88" },
      commitRefs: [
        "fd8ff14",
        "eafce79",
        "923ac38",
        "832a839",
        "521e1da",
        "da55cb8",
        "404b68b",
        "0961d46",
        "19bfd53",
        "809e225",
        "880f469",
        "ba5afe1",
        "17484c5",
      ],
      transcriptsFound: true,
      notes:
        "RBAC enforcement and admin UI shipped in one batch; cookie/login refresh fix included.",
    },
  },
  {
    id: "2026-06-17-personalized-home",
    audience: "everyone",
    title: "A home page tailored to your role",
    publishedAt: "2026-06-17",
    summary:
      "The new Home page shows cards and shortcuts that match what you are allowed to do—classes, assignments, payments, and more.",
    bullets: [
      "Teachers see today’s classes, pending grading, and attendance highlights when those apply to you.",
      "Students see your next class, assignments due, and recent grades on one screen.",
      "Finance and admin widgets appear only when your permissions include them.",
    ],
    categories: ["feature"],
    affectedAreas: [{ label: "Home", href: "/home" }],
    screenshots: [
      {
        src: "/changelog/2026-06-17-personalized-home/overview.png",
        alt: "Home dashboard with welcome message and role-specific widgets",
        caption:
          "Widgets appear based on what you can access—welcome, classes, assignments, and school metrics.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-17T11:45:00+06:30",
      summarizedCommits: { fe: "85a8acc", be: "ba5afe1" },
      sinceCommits: { fe: "51ba784", be: "6c98d88" },
      commitRefs: ["85a8acc", "ba5afe1"],
      transcriptsFound: true,
    },
  },
  {
    id: "2026-06-17-whats-new-changelog",
    audience: "everyone",
    title: "See what’s new in Schedjuice",
    publishedAt: "2026-06-17",
    summary:
      "A What’s New page lists recent product updates in plain language, with screenshots where helpful.",
    bullets: [
      "Open What’s New from the sidebar to browse updates grouped by month.",
      "Students see changes that affect their classes and account; staff see the full list.",
      "Many pages now show loading placeholders instead of blank screens while data loads.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [{ label: "What’s new", href: "/changelog" }],
    screenshots: [
      {
        src: "/changelog/2026-06-17-whats-new-changelog/overview.png",
        alt: "What’s New changelog feed with update cards",
        caption:
          "Browse recent updates with summaries, categories, and screenshots.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "after last summarized commit",
      generatedAt: "2026-06-17T11:30:00+06:30",
      summarizedCommits: { fe: "e904fe1", be: "6c98d88" },
      sinceCommits: { fe: "51ba784", be: "6c98d88" },
      commitRefs: ["e904fe1"],
      transcriptsFound: true,
      notes: "Loading skeletons shipped in the same frontend commit as the changelog page.",
    },
  },
  {
    id: "2026-06-16-attendance-overview-present-late",
    audience: "staff",
    title: "See who attended, arrived late, or was absent",
    publishedAt: "2026-06-16",
    summary:
      "The attendance overview now shows present and late students alongside absences, so you get a fuller picture of each day.",
    bullets: [
      "Daily attendance summary cards now include counts for students who were present or late.",
      "When you filter by status, the totals still reflect the full day.",
      "Exports and detail views include the same breakdown.",
    ],
    categories: ["feature", "improvement"],
    affectedAreas: [
      { label: "Attendance overview", href: "/attendances/god-view" },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-16-attendance-overview-present-late/overview.png",
        alt: "Attendance overview showing present, late, and absent summary cards",
        caption:
          "Daily summary cards now include present and late counts alongside absences.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "seed entry (manual)",
      generatedAt: "2026-06-16T21:13:00+06:30",
      summarizedCommits: { fe: "51ba784", be: "6c98d88" },
      commitRefs: ["51ba784", "6c98d88"],
      transcriptsFound: false,
      notes: "Initial seed entry from recent git history.",
    },
  },
  {
    id: "2026-06-16-assignment-submission-tracker",
    audience: "staff",
    title: "Track missing and overdue assignment submissions",
    publishedAt: "2026-06-16",
    summary:
      "A new view helps teachers and admins spot students who have not submitted work on time.",
    bullets: [
      "Search across courses and date ranges to find gaps in submissions.",
      "Summary cards highlight how many students and courses need follow-up.",
      "Open a student’s detail to see exactly what is missing or overdue.",
    ],
    categories: ["feature"],
    affectedAreas: [
      {
        label: "Submission tracker",
        href: "/assessments/submission-tracker",
      },
    ],
    screenshots: [
      {
        src: "/changelog/2026-06-16-assignment-submission-tracker/overview.png",
        alt: "Submission tracker with summary cards and student results table",
        caption:
          "Search by course and date range, then review summary cards and missing submissions.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "seed entry (manual)",
      generatedAt: "2026-06-16T20:27:00+06:30",
      summarizedCommits: { fe: "f52c386", be: "ba5c4ce" },
      commitRefs: ["f52c386", "ba5c4ce"],
      transcriptsFound: false,
      notes: "Initial seed entry from recent git history.",
    },
  },
  {
    id: "2026-06-16-public-profile-qualifications",
    audience: "everyone",
    title: "Add qualifications to your profile",
    publishedAt: "2026-06-16",
    summary:
      "You can now list qualifications on your profile so others at your school can see your background.",
    bullets: [
      "Add qualifications from your profile page.",
      "Qualifications appear on your public profile when enabled.",
      "School staff can still help review profile completeness where needed.",
    ],
    categories: ["feature"],
    affectedAreas: [{ label: "Your profile", href: "/profile" }],
    screenshots: [
      {
        src: "/changelog/2026-06-16-public-profile-qualifications/overview.png",
        alt: "Profile edit page with public profile toggle and qualifications editor",
        caption:
          "Add qualifications from the Public Profile section on your profile edit page.",
      },
    ],
    screenshotStatus: "captured",
    source: {
      sourceRange: "seed entry (manual)",
      generatedAt: "2026-06-16T19:29:00+06:30",
      summarizedCommits: { fe: "c345271", be: "8837e4b" },
      commitRefs: ["c345271", "8837e4b"],
      transcriptsFound: false,
      notes: "Initial seed entry from recent git history.",
    },
  },
];
