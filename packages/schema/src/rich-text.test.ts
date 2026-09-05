import { describe, expect, it } from 'vitest';
import { emptyRichText, richTextSchema, richTextToPlainText } from './rich-text';

const doc = (...content: unknown[]) => richTextSchema.parse({ type: 'doc', content });
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('richTextSchema', () => {
  it('accepts an empty document', () => {
    expect(richTextSchema.parse(emptyRichText())).toEqual({ type: 'doc', content: [] });
  });

  it('accepts arbitrarily nested nodes', () => {
    const nested = doc({
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'deep' }] }],
    });
    expect(richTextToPlainText(nested)).toBe('deep');
  });

  it('rejects a non-doc root', () => {
    expect(() => richTextSchema.parse({ type: 'paragraph', content: [] })).toThrow();
  });

  it('rejects a node without a type', () => {
    expect(() => richTextSchema.parse({ type: 'doc', content: [{ text: 'orphan' }] })).toThrow();
  });
});

describe('richTextToPlainText', () => {
  it('returns an empty string for an empty document', () => {
    expect(richTextToPlainText(emptyRichText())).toBe('');
  });

  it('separates block nodes with newlines', () => {
    expect(richTextToPlainText(doc(para('one'), para('two')))).toBe('one\ntwo');
  });

  it('does not insert breaks between inline nodes', () => {
    const inline = doc({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'bold' },
        { type: 'text', text: 'ed' },
      ],
    });
    expect(richTextToPlainText(inline)).toBe('bolded');
  });

  it('trims the trailing newline left by the final block', () => {
    expect(richTextToPlainText(doc(para('only')))).toBe('only');
  });

  it('handles a block node with no content', () => {
    expect(richTextToPlainText(doc({ type: 'paragraph' }))).toBe('');
  });

  it('separates list items with newlines', () => {
    const list = doc({
      type: 'bullet_list',
      content: [
        {
          type: 'list_item',
          content: [para('one')],
        },
        {
          type: 'list_item',
          content: [para('two')],
        },
      ],
    });
    expect(richTextToPlainText(list)).toBe('one\ntwo');
  });

  it('flattens blockquote content', () => {
    const quoted = doc({
      type: 'blockquote',
      content: [para('quoted')],
    });
    expect(richTextToPlainText(quoted)).toBe('quoted');
  });
});
