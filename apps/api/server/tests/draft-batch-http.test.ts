import { addDraftQuestionsInput } from './add-draft-questions';
import { describe, expect, it } from 'vitest';

describe('addDraftQuestionsInput HTTP schema', () => {
  it('accepts a typical quick-add payload', () => {
    const result = addDraftQuestionsInput.safeParse({
      testId: 'a80b7d5c-1b8e-47d6-ae3e-33709c0f5d8c',
      kind: 'short',
      count: 3,
    });

    expect(result.success).toBe(true);
  });

  it('rejects string count', () => {
    const result = addDraftQuestionsInput.safeParse({
      testId: 'a80b7d5c-1b8e-47d6-ae3e-33709c0f5d8c',
      kind: 'short',
      count: '3',
    });

    expect(result.success).toBe(false);
  });
});
