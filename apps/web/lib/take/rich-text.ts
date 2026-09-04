import { richTextToPlainText, type RichText } from '@scholis/schema';

// Plain text until the ProseMirror editor lands. Reuses the shared flattener so
// client and server agree on what a document says.
export const plainText = (doc: RichText): string => richTextToPlainText(doc);

export const textDoc = (text: string): RichText => ({
  type: 'doc',
  content: text === '' ? [] : [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
