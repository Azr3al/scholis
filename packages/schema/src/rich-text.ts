import { z } from 'zod';

<<<<<<< HEAD
/**
 * TipTap document JSON.
 *
 * Validated structurally, not exhaustively: we check that a document is a tree
 * of nodes with string types, and stop there. Which node types are legal is an
 * editor concern that changes every time the toolbar does, and duplicating
 * TipTap's schema here would mean two definitions drifting apart — exactly what
 * principle §3 ("one concept, one home") exists to prevent.
 *
 * What this does buy: a malformed or hostile payload cannot reach the database
 * as arbitrary JSON, and `body_text` extraction can assume a well-formed tree.
 */
=======
// ProseMirror document JSON.
//
// Validated structurally, not exhaustively. Which node types are legal changes
// every time the toolbar does, and duplicating the editor's schema here would
// just give us two definitions to drift apart.
//
// That looseness is why swapping the editor isn't a schema change.
>>>>>>> master
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
<<<<<<< HEAD
    attrs: z.record(z.unknown()).optional(),
    content: z.array(richTextNodeSchema).optional(),
    marks: z
      .array(z.object({ type: z.string().min(1), attrs: z.record(z.unknown()).optional() }))
=======
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(richTextNodeSchema).optional(),
    marks: z
      .array(
        z.object({ type: z.string().min(1), attrs: z.record(z.string(), z.unknown()).optional() }),
      )
>>>>>>> master
      .optional(),
    text: z.string().optional(),
  }),
);

export const richTextSchema = z.object({
  type: z.literal('doc'),
  content: z.array(richTextNodeSchema),
});

export type RichText = z.infer<typeof richTextSchema>;

<<<<<<< HEAD
/** An empty document. TipTap's canonical "nothing here yet". */
export const emptyRichText = (): RichText => ({ type: 'doc', content: [] });

/**
 * Flatten a document to plain text.
 *
 * Used for search indexing, `body_text`, and essay comment anchoring. Block
 * boundaries become newlines so that character offsets stay meaningful to a
 * human reading the rendered answer.
 */
=======
/** An empty document. ProseMirror's canonical "nothing here yet". */
export const emptyRichText = (): RichText => ({ type: 'doc', content: [] });

/** Wrap plain text as a one-paragraph document — used for legacy short answers. */
export const textToRichText = (text: string): RichText => ({
  type: 'doc',
  content: text.trim() === '' ? [] : [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

// Block boundaries become newlines so character offsets still line up with
// what a human sees rendered — essay comment anchoring depends on it.
>>>>>>> master
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
<<<<<<< HEAD
  'listItem',
=======
>>>>>>> master
  'codeBlock',
  'tableRow',
]);

const isBlockNode = (type: string): boolean => BLOCK_NODES.has(type);
