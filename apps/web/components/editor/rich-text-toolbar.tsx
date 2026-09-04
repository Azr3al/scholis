'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  readToolbarState,
  runBlockquote,
  runLink,
  runMark,
  runToggleList,
  validateHttpUrl,
  type ToolbarState,
} from '@/lib/rich-text/commands';
import { richTextSchema } from '@/lib/rich-text/schema';
import type { EditorView } from 'prosemirror-view';
import { redo, undo } from 'prosemirror-history';
import {
  BoldIcon,
  ChevronDownIcon,
  ImageIcon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  MusicIcon,
  PencilIcon,
  PlusIcon,
  QuoteIcon,
  Redo2Icon,
  SigmaIcon,
  Undo2Icon,
} from 'lucide-react';

interface Props {
  view: EditorView | null;
  revision: number;
  compact?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onError: (message: string | null) => void;
  onInsertMath: () => void;
  onInsertImage: () => void;
  onInsertAudio: () => void;
  onInsertDraw: () => void;
  onInsertEmbed: () => void;
}

export const RichTextToolbar = ({
  view,
  revision,
  compact = false,
  disabled = false,
  busy = false,
  onError,
  onInsertMath,
  onInsertImage,
  onInsertAudio,
  onInsertDraw,
  onInsertEmbed,
}: Props) => {
  void revision;
  const state: ToolbarState = readToolbarState(view?.state);
  const editorDisabled = disabled || view === null;

  const run = (action: (editor: EditorView) => void) => {
    if (view === null) return;
    action(view);
  };

  const handleLink = () => {
    if (view === null || !state.canLink) return;
    const href = window.prompt('Link address, starting with https://');
    if (href === null) return;
    const valid = validateHttpUrl(href);
    if (valid === null) {
      onError('Links must start with http:// or https://');
      return;
    }
    onError(null);
    runLink(view, valid);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/30 px-1 py-1"
      data-slot="rich-text-toolbar"
    >
      <ToolbarButton
        label="Bold"
        active={state.strong}
        disabled={editorDisabled}
        onClick={() => {
          run((editor) => {
            runMark(editor, 'strong');
          });
        }}
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={state.em}
        disabled={editorDisabled}
        onClick={() => {
          run((editor) => {
            runMark(editor, 'em');
          });
        }}
      >
        <ItalicIcon />
      </ToolbarButton>

      {!compact && (
        <>
          <ToolbarDivider />

          <ToolbarButton
            label="Link"
            testId="toolbar-link"
            active={state.link}
            disabled={editorDisabled || !state.canLink}
            onClick={handleLink}
          >
            <Link2Icon />
          </ToolbarButton>

          <ToolbarDivider />

          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={editorDisabled}
              className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-transparent px-2 text-[0.8rem] font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
              onMouseDown={(e) => {
                e.preventDefault();
              }}
            >
              <PlusIcon className="size-3.5" />
              Insert
              <ChevronDownIcon className="size-3.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuPositioner align="start">
                <DropdownMenuContent className="min-w-40">
                  <DropdownMenuItem
                    disabled={editorDisabled || busy}
                    onClick={() => {
                      onInsertImage();
                    }}
                  >
                    <ImageIcon />
                    Image
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={editorDisabled || busy}
                    onClick={() => {
                      onInsertAudio();
                    }}
                  >
                    <MusicIcon />
                    Audio
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={editorDisabled || busy}
                    onClick={() => {
                      onInsertDraw();
                    }}
                  >
                    <PencilIcon />
                    Draw
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={editorDisabled}
                    onClick={() => {
                      onInsertEmbed();
                    }}
                  >
                    <Link2Icon />
                    Link card
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPositioner>
            </DropdownMenuPortal>
          </DropdownMenu>

          <ToolbarDivider />

          <ToolbarButton
            label="Undo"
            disabled={editorDisabled || !state.canUndo}
            onClick={() => {
              run((editor) => {
                undo(editor.state, editor.dispatch);
                editor.focus();
              });
            }}
          >
            <Undo2Icon />
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            disabled={editorDisabled || !state.canRedo}
            onClick={() => {
              run((editor) => {
                redo(editor.state, editor.dispatch);
                editor.focus();
              });
            }}
          >
            <Redo2Icon />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            label="Bullet list"
            testId="toolbar-bullet-list"
            active={state.bulletList}
            disabled={editorDisabled}
            onClick={() => {
              run((editor) => {
                runToggleList(editor, richTextSchema.nodes.bullet_list);
              });
            }}
          >
            <ListIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            testId="toolbar-ordered-list"
            active={state.orderedList}
            disabled={editorDisabled}
            onClick={() => {
              run((editor) => {
                runToggleList(editor, richTextSchema.nodes.ordered_list);
              });
            }}
          >
            <ListOrderedIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Blockquote"
            testId="toolbar-blockquote"
            active={state.blockquote}
            disabled={editorDisabled}
            onClick={() => {
              run(runBlockquote);
            }}
          >
            <QuoteIcon />
          </ToolbarButton>

          <ToolbarDivider />
        </>
      )}

      <ToolbarButton
        label="Equation"
        testId="insert-math"
        disabled={editorDisabled}
        onClick={onInsertMath}
      >
        <SigmaIcon />
      </ToolbarButton>

      {!compact && (
        <>
          <ToolbarButton
            label="Image"
            testId="insert-image"
            disabled={editorDisabled || busy}
            onClick={onInsertImage}
          >
            <ImageIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Audio"
            testId="insert-audio"
            disabled={editorDisabled || busy}
            onClick={onInsertAudio}
          >
            <MusicIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Draw"
            testId="insert-drawing"
            disabled={editorDisabled || busy}
            onClick={onInsertDraw}
          >
            <PencilIcon />
          </ToolbarButton>
        </>
      )}

      {busy && <span className="px-1 text-xs text-muted-foreground">Uploading…</span>}
    </div>
  );
};

const ToolbarDivider = () => <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />;

const ToolbarButton = ({
  label,
  onClick,
  disabled,
  active = false,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  testId?: string;
}) => (
  <Button
    type="button"
    variant={active ? 'secondary' : 'ghost'}
    size="icon-sm"
    className={cn('size-7 shrink-0', active && 'bg-muted')}
    aria-label={label}
    title={label}
    aria-pressed={active}
    disabled={disabled}
    data-testid={testId}
    onMouseDown={(e) => {
      e.preventDefault();
    }}
    onClick={onClick}
  >
    {children}
  </Button>
);
