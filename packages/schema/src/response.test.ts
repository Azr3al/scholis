import { describe, expect, it } from 'vitest';
import { isAnswered, responseValueSchema } from './response';
<<<<<<< HEAD
import { emptyRichText, richTextSchema } from './rich-text';
=======
import { emptyRichText, richTextSchema, textToRichText } from './rich-text';
>>>>>>> master

describe('responseValueSchema', () => {
  it('parses each of the three shapes', () => {
    expect(responseValueSchema.parse({ kind: 'choice', optionIds: ['a'] }).kind).toBe('choice');
<<<<<<< HEAD
    expect(responseValueSchema.parse({ kind: 'short', text: 'hi' }).kind).toBe('short');
=======
    expect(responseValueSchema.parse({ kind: 'short', text: 'hi' })).toMatchObject({
      kind: 'short',
      doc: textToRichText('hi'),
    });
>>>>>>> master
    expect(responseValueSchema.parse({ kind: 'essay', doc: emptyRichText() }).kind).toBe('essay');
  });

  it('rejects an unknown kind', () => {
    expect(() => responseValueSchema.parse({ kind: 'boolean', value: true })).toThrow();
  });

  it('rejects a shape that does not match its own kind', () => {
    expect(() => responseValueSchema.parse({ kind: 'short', optionIds: ['a'] })).toThrow();
  });
});

/**
 * `isAnswered` drives progress counts and the unanswered warning at submit, so
 * "present but empty" must read as unanswered. Otherwise the UI reports 20/20
 * while the student has typed nothing.
 */
describe('isAnswered', () => {
  it('treats an empty selection as unanswered', () => {
    expect(isAnswered({ kind: 'choice', optionIds: [] })).toBe(false);
    expect(isAnswered({ kind: 'choice', optionIds: ['a'] })).toBe(true);
  });

  it('treats whitespace-only short answers as unanswered', () => {
<<<<<<< HEAD
    expect(isAnswered({ kind: 'short', text: '   \n\t ' })).toBe(false);
    expect(isAnswered({ kind: 'short', text: ' answer ' })).toBe(true);
=======
    expect(isAnswered({ kind: 'short', doc: textToRichText('   \n\t ') })).toBe(false);
    expect(isAnswered({ kind: 'short', doc: textToRichText(' answer ') })).toBe(true);
>>>>>>> master
  });

  it('treats an empty essay document as unanswered', () => {
    expect(isAnswered({ kind: 'essay', doc: emptyRichText() })).toBe(false);
  });

  it('treats an essay with content as answered', () => {
    const doc = richTextSchema.parse({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'because' }] }],
    });
    expect(isAnswered({ kind: 'essay', doc })).toBe(true);
  });
});
