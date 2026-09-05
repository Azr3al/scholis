import { z } from 'zod';

// ProseMirror document JSON.
//
// Validated structurally, not exhaustively. Which node types are legal changes
// every time the toolbar does, and duplicating the editor's schema here would
// just give us two definitions to drift apart.
//
// That looseness is why swapping the editor isn't a schema change.
export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown> | undefined;
  content?: RichTextNode[] | undefined;
  marks?: { type: string; attrs?: Record<string, unknown> | undefined }[] | undefined;
  text?: string | undefined;
}

export const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(richTextNodeSchema).optional(),
    marks: z
      .array(
        z.object({ type: z.string().min(1), attrs: z.record(z.string(), z.unknown()).optional() }),
      )
      .optional(),
    text: z.string().optional(),
  }),
);

export const richTextSchema = z.object({
  type: z.literal('doc'),
  content: z.array(richTextNodeSchema),
});

export type RichText = z.infer<typeof richTextSchema>;

/** An empty document. ProseMirror's canonical "nothing here yet". */
export const emptyRichText = (): RichText => ({ type: 'doc', content: [] });

/** Wrap plain text as a one-paragraph document — used for legacy short answers. */
export const textToRichText = (text: string): RichText => ({
  type: 'doc',
  content: text.trim() === '' ? [] : [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

// Block boundaries become newlines so character offsets still line up with
// what a human sees rendered — essay comment anchoring depends on it.
export const richTextToPlainText = (doc: RichText): string => {
  const walk = (nodes: RichTextNode[]): string =>
    nodes
      .map((node) => {
        if (typeof node.text === 'string') return node.text;
        const inner = node.content ? walk(node.content) : '';
        return isBlockNode(node.type) ? `${inner}\n` : inner;
      })
      .join('');

  return walk(doc.content).replace(/\n+$/, '');
};

const BLOCK_NODES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'tableRow',
]);

const isBlockNode = (type: string): boolean => BLOCK_NODES.has(type);
