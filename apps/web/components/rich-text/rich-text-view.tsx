'use client';

import type { RichText, RichTextNode } from '@scholis/schema';
import katex from 'katex';
import type { ReactNode } from 'react';

/**
 * Renders a stored question body.
 *
 * Replaces `plainText()` at every display site. That function flattened a
 * document to a string, which was fine while the only node was a paragraph and
 * silently discarded everything the moment images and equations existed.
 *
 * Unknown node types render as nothing rather than throwing. A document written
 * by a newer editor should degrade, not take the take flow down mid-exam.
 */

const attr = (node: RichTextNode, name: string): string => {
  const value = node.attrs?.[name];
  return typeof value === 'string' ? value : '';
};

const withMarks = (node: RichTextNode, key: string): ReactNode => {
  let out: ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'strong') out = <strong>{out}</strong>;
    if (mark.type === 'em') out = <em>{out}</em>;
    if (mark.type === 'link') {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
      out = (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
          {out}
        </a>
      );
    }
  }
  return <span key={key}>{out}</span>;
};

const Math = ({ latex }: { latex: string }) => {
  const html = katex.renderToString(latex, { throwOnError: false, displayMode: false });
  return <span className="mx-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
};

const renderInline = (nodes: RichTextNode[], keyPrefix: string): ReactNode[] =>
  nodes.map((child, i) => renderNode(child, `${keyPrefix}-${String(i)}`));

const renderNode = (node: RichTextNode, key: string): ReactNode => {
  switch (node.type) {
    case 'text':
      return withMarks(node, key);

    case 'paragraph':
      return (
        <p key={key} className="whitespace-pre-wrap">
          {renderInline(node.content ?? [], key)}
        </p>
      );

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
        >
          {(node.content ?? []).map((child, i) => renderNode(child, `${key}-${String(i)}`))}
        </blockquote>
      );

    case 'bullet_list':
      return (
        <ul key={key} className="my-2 list-disc pl-6">
          {(node.content ?? []).map((child, i) => renderNode(child, `${key}-${String(i)}`))}
        </ul>
      );

    case 'ordered_list':
      return (
        <ol key={key} className="my-2 list-decimal pl-6">
          {(node.content ?? []).map((child, i) => renderNode(child, `${key}-${String(i)}`))}
        </ol>
      );

    case 'list_item':
      return (
        <li key={key}>
          {(node.content ?? []).map((child, i) => renderNode(child, `${key}-${String(i)}`))}
        </li>
      );

    case 'image':
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={attr(node, 'src')}
          alt={attr(node, 'alt')}
          className="my-2 max-h-96 rounded-md border"
        />
      );

    case 'audio':
      return (
        <audio key={key} controls src={attr(node, 'src')} className="my-2 w-full">
          <track kind="captions" />
        </audio>
      );

    case 'embed': {
      const href = attr(node, 'href');
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-ui my-2 block truncate rounded-md border px-3 py-2 text-sm text-primary hover:bg-muted"
        >
          {attr(node, 'title') || href}
        </a>
      );
    }

    case 'math':
      return <Math key={key} latex={attr(node, 'latex')} />;

    default:
      return null;
  }
};

export const RichTextView = ({ doc, className }: { doc: RichText; className?: string }) => (
  <div className={className}>
    {doc.content.map((node, i) => renderNode(node, String(i)))}
  </div>
);

/** True when a document has nothing a student would see. */
export const isEmptyRichText = (doc: RichText): boolean =>
  doc.content.every(
    (node) =>
      (node.content ?? []).length === 0 &&
      node.text === undefined &&
      !['image', 'audio', 'embed', 'math'].includes(node.type),
  );
