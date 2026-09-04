import type { MarkType, NodeType } from 'prosemirror-model';
import { liftListItem, wrapInList } from 'prosemirror-schema-list';
import { toggleMark, wrapIn } from 'prosemirror-commands';
import { redoDepth, undoDepth } from 'prosemirror-history';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

import { richTextSchema } from '@/lib/rich-text/schema';

export interface ToolbarState {
  strong: boolean;
  em: boolean;
  link: boolean;
  blockquote: boolean;
  bulletList: boolean;
  orderedList: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canLink: boolean;
}

export const readToolbarState = (state: EditorState | undefined): ToolbarState => {
  if (state === undefined) {
    return {
      strong: false,
      em: false,
      link: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      canUndo: false,
      canRedo: false,
      canLink: false,
    };
  }

  const { from, to, empty, $from } = state.selection;

  const markActive = (type: MarkType): boolean => {
    if (empty) return type.isInSet(state.storedMarks ?? $from.marks()) !== undefined;
    return state.doc.rangeHasMark(from, to, type);
  };

  const parentList = findListParent($from);
  const inBlockquote = blockParentType($from, richTextSchema.nodes.blockquote);

  return {
    strong: markActive(richTextSchema.marks.strong),
    em: markActive(richTextSchema.marks.em),
    link: markActive(richTextSchema.marks.link),
    blockquote: inBlockquote,
    bulletList: parentList === richTextSchema.nodes.bullet_list,
    orderedList: parentList === richTextSchema.nodes.ordered_list,
    canUndo: undoDepth(state) > 0,
    canRedo: redoDepth(state) > 0,
    canLink: !empty,
  };
};

const findListParent = ($from: EditorState['selection']['$from']): NodeType | null => {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const type = $from.node(depth).type;
    if (type === richTextSchema.nodes.bullet_list || type === richTextSchema.nodes.ordered_list) {
      return type;
    }
  }
  return null;
};

const blockParentType = (
  $from: EditorState['selection']['$from'],
  type: NodeType,
): boolean => {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === type) return true;
  }
  return false;
};

export const runMark = (view: EditorView, name: 'strong' | 'em') => {
  toggleMark(richTextSchema.marks[name])(view.state, view.dispatch);
  view.focus();
};

export const runLink = (view: EditorView, href: string) => {
  const { from, to, empty } = view.state.selection;
  if (empty) return;
  const mark = richTextSchema.marks.link.create({ href, title: null });
  view.dispatch(view.state.tr.addMark(from, to, mark));
  view.focus();
};

export const runBlockquote = (view: EditorView) => {
  const { $from } = view.state.selection;
  if (blockParentType($from, richTextSchema.nodes.blockquote)) {
    liftBlockquote(view);
    return;
  }
  wrapIn(richTextSchema.nodes.blockquote)(view.state, view.dispatch);
  view.focus();
};

const liftBlockquote = (view: EditorView) => {
  const { $from, $to } = view.state.selection;
  const range = $from.blockRange($to, (node) => node.type === richTextSchema.nodes.blockquote);
  if (range === null) return;
  view.dispatch(view.state.tr.lift(range, range.depth - 1));
  view.focus();
};

export const runToggleList = (view: EditorView, listType: NodeType) => {
  const { $from } = view.state.selection;
  const parentList = findListParent($from);

  if (parentList === listType) {
    liftListItem(richTextSchema.nodes.list_item)(view.state, view.dispatch);
  } else if (parentList !== null) {
    if (liftListItem(richTextSchema.nodes.list_item)(view.state, view.dispatch)) {
      wrapInList(listType)(view.state, view.dispatch);
    }
  } else {
    wrapInList(listType)(view.state, view.dispatch);
  }
  view.focus();
};

export const validateHttpUrl = (raw: string): string | null => {
  const href = raw.trim();
  if (href === '') return null;
  if (!/^https?:\/\//i.test(href)) return null;
  return href;
};
