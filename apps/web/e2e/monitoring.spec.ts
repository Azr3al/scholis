import type { Page } from '@playwright/test';
import { addQuestion, answer, createTest, editable, handIn, publishAndReadCode } from './authoring';
import { expect, test } from './fixtures';

/**
 * The student-facing side of monitoring, and the bottom navigation it sits in.
 *
 * These assertions are deliberately about observable behaviour — what is on
 * screen, what reaches the server — rather than about the hooks that produce
 * it, because the hooks are the part most likely to be rewritten.
 */

const startAttempt = async (student: Page, code: string, name = 'Ada Lovelace') => {
  await student.goto('/take');
  await student.getByLabel('Test code').fill(code);
  await student.getByLabel('Your name').fill(name);
  await student.getByRole('button', { name: 'Start' }).click();
  await expect(student.getByTestId('question-card')).toBeVisible();
};

test('the navigation bar stays on screen without covering the question', async ({
  signedIn: page,
  context,
}) => {
  await createTest(page, 'Long paper');
  // Long enough that the page scrolls on a phone-sized viewport, which is the
  // only situation where a fixed bar can hide something.
  await addQuestion(page, 'essay', `A long prompt. ${'Consider carefully. '.repeat(60)}`);
  await addQuestion(page, 'short', 'Second question', { accepted: ['yes'] });
  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext({
    viewport: { width: 390, height: 640 },
  });
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();
  await startAttempt(student, code);

  const nav = student.getByTestId('take-nav');
  await expect(nav).toBeVisible();

  const viewport = student.viewportSize();
  if (viewport === null) throw new Error('no viewport');

  // Sitting at the bottom edge before any scrolling.
  const atTop = await nav.boundingBox();
  expect(atTop).not.toBeNull();
  expect(Math.round((atTop?.y ?? 0) + (atTop?.height ?? 0))).toBeLessThanOrEqual(
    viewport.height + 1,
  );

  // Still there after scrolling to the end of a long question — that is the
  // whole point of fixing it.
  await student.mouse.wheel(0, 4000);
  const afterScroll = await nav.boundingBox();
  expect(Math.round((afterScroll?.y ?? 0) + (afterScroll?.height ?? 0))).toBeLessThanOrEqual(
    viewport.height + 1,
  );

  // And the bar does not sit on top of the answer box: the spacer under the
  // card has to keep the last of the content clear of it.
  await student.keyboard.press('End');
  const essay = student.getByTestId(/^essay-/);
  await essay.scrollIntoViewIfNeeded();
  const answerBox = await essay.boundingBox();
  const barBox = await nav.boundingBox();
  expect(answerBox).not.toBeNull();
  expect((answerBox?.y ?? 0) + (answerBox?.height ?? 0)).toBeLessThanOrEqual(barBox?.y ?? 0);

  // Navigation semantics are unchanged by the bar being fixed.
  await expect(student.getByTestId('position')).toContainText('1 of 2');
  await student.getByTestId('next').click();
  await expect(student.getByTestId('position')).toContainText('2 of 2');
  await expect(student.getByTestId('prev')).toBeEnabled();

  await studentContext.close();
});

test('an essay refuses a paste but accepts typing', async ({ signedIn: page, context }) => {
  await createTest(page, 'Essay paper');
  await addQuestion(page, 'essay', 'Describe photosynthesis in your own words.');
  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext({
    // Granted so the paste is a real one. Without it the write fails and the
    // test would pass for the wrong reason.
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();
  await startAttempt(student, code);

  const essay = editable(student, /^essay-/);
  await essay.click();

  // Put something on the clipboard the way a student would: copy from
  // elsewhere, then try to paste it in.
  await student.evaluate(async () => {
    await navigator.clipboard.writeText('Plants convert light into chemical energy.');
  });
  await student.keyboard.press('ControlOrMeta+V');

  await expect(essay).toHaveText('');

  // Typing is untouched — refusing the clipboard must not make the box hostile.
  await essay.fill('Plants use light to make food.');
  await expect(essay).toHaveText('Plants use light to make food.');

  // A second paste on top of existing work is refused too, and leaves that work
  // alone rather than replacing it.
  await student.keyboard.press('ControlOrMeta+V');
  await expect(essay).toHaveText('Plants use light to make food.');

  // The answer still syncs, so refusing paste did not break the change handler.
  await expect(student.getByTestId('sync-status')).toContainText(/saved/i);

  await studentContext.close();
});

test('test-taking mode refuses copying, and is off unless the teacher asks', async ({
  signedIn: page,
  context,
}) => {
  await createTest(page, 'Guarded paper');
  await addQuestion(page, 'short', 'What is the capital of France?', { accepted: ['Paris'] });

  // Adding a question leaves you in that question, so settings is a step away.
  await page.getByTestId('pane-settings').click();

  // Off by default: a teacher who never opens settings gets ordinary behaviour.
  await expect(page.getByTestId('test-settings-taking-mode')).not.toBeChecked();
  await page.getByTestId('test-settings-taking-mode').check();

  // Settings autosave on a debounce, and the indicator already reads "Saved"
  // from the last time. Both states are waited for, or publishing would race a
  // request that had not been sent yet.
  const status = page.getByTestId('test-settings-status');
  await expect(status).toHaveText('Saving…');
  await expect(status).toHaveText('Saved');

  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();
  await startAttempt(student, code);

  const card = student.getByTestId('question-card');

  // Selection is off, so a drag-select yields nothing to copy.
  await expect(card).toHaveClass(/select-none/);

  // The copy event itself is refused. Checked by listening for the default
  // being prevented rather than by reading the clipboard, which headless
  // browsers do not populate from a refused copy.
  const copyPrevented = await card.evaluate((el) => {
    const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(copyPrevented).toBe(true);

  const menuPrevented = await card.evaluate((el) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(menuPrevented).toBe(true);

  // Answering still works. A deterrent that breaks the test is worse than none.
  await answer(student, /^short-/, 'Paris');
  await expect(student.getByTestId('sync-status')).toContainText(/saved/i);

  await studentContext.close();
});

test('time per question and leaving the tab reach the teacher', async ({
  signedIn: page,
  context,
}) => {
  await createTest(page, 'Watched paper');
  await addQuestion(page, 'short', 'First question', { accepted: ['a'] });
  await addQuestion(page, 'essay', 'Second question');
  const code = await publishAndReadCode(page);

  const studentContext = await context.browser()?.newContext();
  if (studentContext === undefined) throw new Error('no browser context');
  const student = await studentContext.newPage();
  await startAttempt(student, code);

  // Spend a measurable, unambiguous amount of time on question one.
  await answer(student, /^short-/, 'a');
  await student.waitForTimeout(2500);

  // Leave and come back. The Playwright page stays open, so visibility is
  // driven directly — this is the event the browser fires when a student
  // switches tab, and the same handler is on the real path.
  await student.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await student.waitForTimeout(300);
  await student.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await student.getByTestId('next').click();
  await answer(student, /^essay-/, 'Something considered.');
  await student.waitForTimeout(1200);

  await handIn(student);

  // The teacher's view of it.
  await page.getByRole('link', { name: 'Submissions' }).click();
  await page.getByTestId('mark-Ada Lovelace').click();

  const events = page.getByTestId('attempt-events');
  await expect(events).toBeVisible();
  await expect(events).toContainText('Left the test 1 time');
  // Reported as an observation, not an accusation.
  await expect(events).toContainText('Browsers cannot tell why');

  // Time was banked against the question that was open, not the attempt as a
  // whole. Both questions have a figure: the first one's only exists if the
  // segment that ran before the tab was hidden was banked, and the second one's
  // only exists if the open segment was banked before the paper closed.
  const times = page.getByTestId(/^time-spent-/);
  await expect(times).toHaveCount(2);

  // A lower bound rather than an exact figure — this is real wall-clock time
  // and a busy machine will not reproduce it to the second. Two and a half
  // seconds were spent on question one before leaving the tab, so anything
  // under two means the first segment was dropped.
  const first = await times.first().innerText();
  expect(first).toMatch(/^\d+s$/);
  expect(Number(first.replace('s', ''))).toBeGreaterThanOrEqual(2);

  await studentContext.close();
});
