'use client';

import { MathCanvas } from '@/components/editor/math-canvas';
import { RichTextToolbar } from '@/components/editor/rich-text-toolbar';
import { api } from '@/lib/api';
import { validateHttpUrl } from '@/lib/rich-text/commands';
import { richTextSchema } from '@/lib/rich-text/schema';
import { cn } from '@/lib/utils';
import type { RichText } from '@scholis/schema';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { Node as PMNode } from 'prosemirror-model';
import { splitListItem } from 'prosemirror-schema-list';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ProseMirror, wired by hand rather than through TipTap.
 *
 * The editor owns its own DOM: React renders an empty div and never touches
 * what is inside it. Re-rendering into a live EditorView would fight
 * ProseMirror for the selection and lose. `onChange` is held in a ref for the
 * same reason — the view is constructed once, and a prop captured in that
 * closure would go stale on the first parent re-render.
 */

interface Props {
  value: RichText;
  onChange: (doc: RichText) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Compact toolbar for option bodies, which are usually a few words. */
  compact?: boolean;
  /**
   * Put the caret here once the editor mounts.
   *
   * Only ever set by the caller that knows this is the field the teacher came
   * to type in — the question body. Options and descriptions leave it off, so
   * opening a form never yanks focus away from whatever was clicked.
   */
  autoFocus?: boolean;
  /**
   * Refuse the clipboard and dropped content.
   *
   * Set on student essay answers, where the words are meant to be the taker's
   * own. Deterrence rather than prevention — retyping still works, and so does
   * every keyboard shortcut that is not a paste.
   */
  refusePaste?: boolean;
  'data-testid'?: string;
}

const EMPTY: RichText = { type: 'doc', content: [] };

export const RichTextEditor = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  compact = false,
  autoFocus = false,
  refusePaste = false,
  'data-testid': testId,
}: Props) => {
  const mount = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const refuseRef = useRef(refusePaste);
  refuseRef.current = refusePaste;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const bump = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!ready || mount.current === null) return;

    const doc =
      value.content.length === 0
        ? richTextSchema.node('doc', null, [richTextSchema.node('paragraph')])
        : PMNode.fromJSON(richTextSchema, value);

    const state = EditorState.create({
      doc,
      plugins: [
        history(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
          'Mod-b': toggleMark(richTextSchema.marks.strong),
          'Mod-i': toggleMark(richTextSchema.marks.em),
          Enter: splitListItem(richTextSchema.nodes.list_item),
        }),
        keymap(baseKeymap),
      ],
    });

    const editor = new EditorView(mount.current, {
      state,
      editable: () => !disabled,
      // Returning true tells ProseMirror the event is dealt with, so nothing is
      // inserted. Read through a ref because the view is built once and a
      // handler closing over the prop would keep its value from mount.
      handlePaste: () => refuseRef.current,
      handleDrop: () => refuseRef.current,
      dispatchTransaction(transaction) {
        const next = editor.state.apply(transaction);
        editor.updateState(next);
        bump();
        if (transaction.docChanged) latest.current(next.doc.toJSON() as RichText);
      },
    });

    view.current = editor;

    // Once, so the toolbar renders against the document that actually exists
    // rather than the empty state it was constructed with.
    bump();

    // After the view exists, and only when asked. Deferred a frame because
    // focusing during mount fights React's own focus handling and loses.
    if (autoFocus && !disabled) {
      requestAnimationFrame(() => {
        editor.focus();
      });
    }

    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [ready]);

  useEffect(() => {
    view.current?.setProps({ editable: () => !disabled });
  }, [disabled]);

  const insert = (node: PMNode) => {
    const editor = view.current;
    if (editor === null) return;
    editor.dispatch(editor.state.tr.replaceSelectionWith(node));
    editor.focus();
  };

  const upload = async (file: Blob, kind: 'image' | 'audio', name: string) => {
    setBusy(true);
    setError(null);
    try {
      const uploaded = await api.uploadFile(file, name);
      insert(
        kind === 'image'
          ? richTextSchema.nodes.image.create({ src: uploaded.url, alt: name })
          : richTextSchema.nodes.audio.create({ src: uploaded.url }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload that file.');
    } finally {
      setBusy(false);
    }
  };

  const pick = (accept: string, kind: 'image' | 'audio') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file !== undefined) void upload(file, kind, file.name);
    };
    input.click();
  };

  const insertMath = () => {
    const latex = window.prompt('LaTeX, e.g. x^2 + y^2 = r^2');
    if (latex !== null && latex.trim() !== '') {
      insert(richTextSchema.nodes.math.create({ latex: latex.trim() }));
    }
  };

  const insertEmbed = () => {
    const href = window.prompt('Link address, starting with https://');
    if (href === null || href.trim() === '') return;
    const valid = validateHttpUrl(href);
    if (valid === null) {
      setError('Links must start with http:// or https://');
      return;
    }
    const title = window.prompt('Text to show (optional)') ?? '';
    insert(richTextSchema.nodes.embed.create({ href: valid, title }));
  };

  return (
    <div className="grid gap-2" data-testid={testId}>
      {!ready ? (
        <div
          className={cn(
            'rounded-lg border border-input bg-muted/30',
            compact ? 'min-h-9' : 'min-h-24',
          )}
          aria-hidden
        />
      ) : (
        <>
          <div
            className={cn(
              'overflow-hidden rounded-lg border border-input bg-background',
              disabled && 'opacity-50',
            )}
          >
            <RichTextToolbar
              view={view.current}
              revision={revision}
              compact={compact}
              disabled={disabled}
              busy={busy}
              onError={setError}
              onInsertMath={insertMath}
              onInsertImage={() => {
                pick('image/png,image/jpeg,image/gif,image/webp', 'image');
              }}
              onInsertAudio={() => {
                pick('audio/mpeg,audio/ogg,audio/wav,audio/webm', 'audio');
              }}
              onInsertDraw={() => {
                setDrawing(true);
              }}
              onInsertEmbed={insertEmbed}
            />

            <div
              ref={mount}
              className={cn(
                'px-2.5 py-2 text-sm',
                '[&_.ProseMirror]:min-h-9 [&_.ProseMirror]:outline-none',
                '[&_.ProseMirror_img]:my-2 [&_.ProseMirror_img]:max-h-64 [&_.ProseMirror_img]:rounded-md [&_.ProseMirror_img]:border',
                '[&_.ProseMirror_audio]:my-2 [&_.ProseMirror_audio]:w-full',
                '[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline',
                '[&_.ProseMirror_span[data-latex]]:rounded [&_.ProseMirror_span[data-latex]]:bg-muted [&_.ProseMirror_span[data-latex]]:px-1',
                '[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6',
                '[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6',
                '[&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-muted-foreground',
                compact ? 'min-h-9' : 'min-h-24',
              )}
              data-placeholder={placeholder}
            />
          </div>

          {error !== null && <p className="text-sm text-destructive">{error}</p>}

          {drawing && (
            <MathCanvas
              onCancel={() => {
                setDrawing(false);
              }}
              onInsert={(blob) => {
                setDrawing(false);
                void upload(blob, 'image', 'drawing.png');
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

export { EMPTY as emptyDoc };
