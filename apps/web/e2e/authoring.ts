import { expect, type Page } from '@playwright/test';

// Shared by the authoring scenarios. Its own module rather than exports from a
// spec file — importing a spec would register its tests a second time.

export type Kind = 'single' | 'multi' | 'short' | 'essay';
export interface Option {
  text: string;
  correct: boolean;
}

/**
 * The editable node inside a rich text field.
 *
 * Short and essay answers are ProseMirror now, not an input and a textarea, so
 * the test id is on a wrapper and `fill`/`toHaveValue` do not apply to it. Every
 * scenario that types an answer goes through here rather than reaching for
 * `.ProseMirror` itself.
 */
export const editable = (page: Page, testId: string | RegExp) =>
  page.getByTestId(testId).locator('.ProseMirror');

/** Types a student's answer and waits for it to land in the document. */
export const answer = async (page: Page, testId: string | RegExp, text: string) => {
  const field = editable(page, testId);
  await field.fill(text);
  await expect(field).toHaveText(text);
};

/**
 * Hands the paper in and gets to the done screen.
 *
 * Handing in no longer lands there directly: students are asked for a comment
 * first, and the done screen only appears once that prompt is answered or
 * skipped. Scenarios that are not about commenting skip it here rather than
 * each repeating the two steps.
 */
export const handIn = async (student: Page) => {
  await student.getByTestId('submit').click();
  await expect(student.getByTestId('comment-prompt')).toBeVisible();
  await student.getByTestId('comment-skip').click();
  await expect(student.getByTestId('take-done')).toBeVisible();
};

const KIND_LABELS: Record<Kind, string> = {
  single: 'Single choice',
  multi: 'Multiple choice',
  short: 'Short answer',
  essay: 'Essay',
};

export const selectQuestionKind = async (page: Page, kind: Kind) => {
  await page.getByTestId('quick-add-kind').click();
  await page.getByRole('option', { name: KIND_LABELS[kind] }).click();
};

/**
 * Section management has its own pane in the two-pane editor, so it has to be
 * opened before any of its controls exist.
 */
export const openSectionsPane = async (page: Page) => {
  await page.getByTestId('pane-sections').click();
  await expect(page.getByTestId('sections-panel')).toBeVisible();
};

export const selectQuestionSection = async (
  page: Page,
  questionIndex: number,
  sectionLabel: string,
) => {
  // The section control sits with the question being edited, so the question
  // has to be open in the main pane before it is on the page at all.
  await page.getByTestId(`expand-question-${String(questionIndex)}`).click();
  await page.getByTestId(`question-section-${String(questionIndex)}`).click();
  await page.getByRole('option', { name: sectionLabel }).click();

  // Assigning is a round trip, and the outline only regroups once it lands.
  // Returning early let the next step act on the old grouping — a drag then
  // moved the question the assignment was still about to move, and the two
  // fought. Cheap to wait for, and it is what the teacher would see anyway.
  await expect(page.getByTestId(`question-section-${String(questionIndex)}`)).toContainText(
    sectionLabel,
  );
};

export const fillOptions = async (page: Page, kind: Kind, options: Option[]) => {
  // The form starts with two rows; add more as needed. No scenario needs to
  // remove surplus rows, so that isn't handled here.
  //
  // The starting number is asserted rather than read: count() is the one
  // locator call that does not retry, so reading it while the form was still
  // switching question type returned a stale total, skipped the clicks and
  // left the last option missing. Slow enough to matter against a production
  // build, fast enough to hide against the dev server.
  const rows = page.getByTestId('option-rows').locator('> div');
  await expect(rows).toHaveCount(2);
  for (let i = 2; i < options.length; i += 1) {
    await page.getByTestId('option-add').click();
  }
  await expect(rows).toHaveCount(options.length);

  for (const [i, option] of options.entries()) {
    // ProseMirror renders a contenteditable, not an input. Playwright's fill
    // works on both, but the target is the editable div inside the wrapper.
    await page
      .getByTestId(`option-body-${String(i)}`)
      .locator('.ProseMirror')
      .fill(option.text);
    const correct = page.getByTestId(`option-correct-${String(i)}`);
    if (option.correct) await correct.check();
    // A radio can't be unchecked — picking the right one clears the rest.
    else if (kind === 'multi') await correct.uncheck();
  }
};

export const fillAccepted = async (page: Page, answers: string[]) => {
  for (let i = 1; i < answers.length; i += 1) await page.getByTestId('accepted-add').click();
  for (const [i, answer] of answers.entries()) {
    await page.getByTestId(`accepted-body-${String(i)}`).fill(answer);
  }
};

export const addQuestion = async (
  page: Page,
  kind: Kind,
  prompt: string,
  detail?: { options?: Option[]; accepted?: string[]; points?: string },
) => {
  await selectQuestionKind(page, kind);
  await page.getByTestId('quick-add-submit').click();
  await expect(page.getByTestId('question-list')).toContainText('Untitled question');

  const cards = page.getByTestId(/^question-card-/);
  await expect(cards.last()).toBeVisible();
  const lastIndex = (await cards.count()) - 1;
  await page.getByTestId(`expand-question-${String(lastIndex)}`).click();

  await page.getByTestId('question-prompt').locator('.ProseMirror').fill(prompt);

  if (kind === 'single' || kind === 'multi') {
    await fillOptions(
      page,
      kind,
      detail?.options ?? [
        { text: 'Right', correct: true },
        { text: 'Wrong', correct: false },
      ],
    );
  }
  if (kind === 'short') {
    const useRubric = detail?.accepted !== undefined;
    if (useRubric) {
      await page.getByTestId('short-grading-rubric').click();
      await fillAccepted(page, detail.accepted ?? ['Paris']);
    }
  }
  if (detail?.points !== undefined) {
    await page.getByLabel('Marks').fill(detail.points);
  }

  await page.getByTestId('save-question').click();

  await expect(page.getByTestId('question-list')).toContainText(prompt);
};

export interface CreateTestOptions {
  /** Stay on `/teacher` after create instead of opening the draft. */
  stayOnHome?: boolean;
  outro?: string;
  attemptsPreset?: number;
  timePresetMinutes?: number;
}

export const createTest = async (page: Page, title: string, options: CreateTestOptions = {}) => {
  await page.getByLabel('Title').fill(title);
  if (options.outro !== undefined) {
    await page.getByTestId('new-test-outro').fill(options.outro);
  }
  if (options.timePresetMinutes !== undefined) {
    await page
      .getByRole('button', { name: new RegExp(`^${String(options.timePresetMinutes)} min`) })
      .click();
  }
  if (options.attemptsPreset !== undefined) {
    const count = options.attemptsPreset;
    const label = count === 1 ? '1 attempt' : `${String(count)} attempts`;
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await page.getByTestId('create-test').click();
  await expect(page.getByRole('link', { name: title })).toBeVisible();
  if (options.stayOnHome !== true) {
    await page.getByRole('link', { name: title }).click();
  }
};

export const publishAndReadCode = async (page: Page): Promise<string> => {
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByTestId('test-status')).toHaveText('published');
  return (await page.getByText(/^Code /).innerText()).replace('Code ', '').trim();
};
