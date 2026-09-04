import { Schema } from 'prosemirror-model';
import { bulletList, listItem, orderedList } from 'prosemirror-schema-list';

const add = <T extends object, U extends object>(base: T, extra: U): T & U => ({
  ...base,
  ...extra,
});

/**
 * The ProseMirror schema for question and option bodies.
 *
 * Deliberately small. Every node here has to render in the take flow, survive a
 * round trip through `richTextSchema` in @scholis/schema, and mean something to
 * a student — so there is no heading, no table, no colour.
 *
 * `richTextSchema` validates structurally rather than enumerating node types,
 * which is why adding all of this needed no migration and no schema change:
 * stored documents already accept any node shape.
 */
export const richTextSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },

    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },

    blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },

    ordered_list: add(orderedList, { content: 'list_item+', group: 'block' }),
    bullet_list: add(bulletList, { content: 'list_item+', group: 'block' }),
    list_item: add(listItem, { content: 'paragraph block*' }),

    text: { group: 'inline' },

    // Block rather than inline: a diagram in a question is its own line, and
    // inline images inside a sentence make line height unpredictable.
    image: {
      group: 'block',
      atom: true,
      draggable: true,
      attrs: { src: {}, alt: { default: '' } },
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs: (dom) => ({
            src: (dom as HTMLImageElement).getAttribute('src'),
            alt: (dom as HTMLImageElement).getAttribute('alt'),
          }),
        },
      ],
      toDOM: (node) => ['img', { src: node.attrs.src as string, alt: node.attrs.alt as string }],
    },

    audio: {
      group: 'block',
      atom: true,
      attrs: { src: {} },
      parseDOM: [{ tag: 'audio[src]', getAttrs: (dom) => ({ src: (dom as HTMLAudioElement).getAttribute('src') }) }],
      toDOM: (node) => ['audio', { src: node.attrs.src as string, controls: 'true' }],
    },

    // A link the teacher wants shown as a card, distinct from a link *mark* on
    // a run of text. Students see the destination rather than hidden text.
    embed: {
      group: 'block',
      atom: true,
      attrs: { href: {}, title: { default: '' } },
      parseDOM: [
        {
          tag: 'a[data-embed]',
          getAttrs: (dom) => ({
            href: (dom as HTMLAnchorElement).getAttribute('href'),
            title: (dom as HTMLAnchorElement).textContent,
          }),
        },
      ],
      toDOM: (node) => [
        'a',
        { href: node.attrs.href as string, 'data-embed': 'true' },
        (node.attrs.title as string) || (node.attrs.href as string),
      ],
    },

    // Inline so an equation can sit inside a sentence. The LaTeX source is the
    // stored truth; KaTeX renders it at display time, so a broken formula is a
    // rendering problem rather than lost content.
    math: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { latex: { default: '' } },
      parseDOM: [
        {
          tag: 'span[data-latex]',
          getAttrs: (dom) => ({ latex: (dom).getAttribute('data-latex') }),
        },
      ],
      toDOM: (node) => ['span', { 'data-latex': node.attrs.latex as string }, node.attrs.latex as string],
    },
  },

  marks: {
    strong: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM: () => ['strong', 0],
    },
    em: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM: () => ['em', 0],
    },
    link: {
      attrs: {
        href: {},
        title: { default: null },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]:not([data-embed])',
          getAttrs: (dom) => ({
            href: (dom as HTMLAnchorElement).getAttribute('href'),
            title: (dom as HTMLAnchorElement).getAttribute('title'),
          }),
        },
      ],
      toDOM: (node) => [
        'a',
        {
          href: node.attrs.href as string,
          title: node.attrs.title as string | null,
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        0,
      ],
    },
  },
});
