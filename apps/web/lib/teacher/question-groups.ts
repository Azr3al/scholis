/**
 * The paper, viewed by section.
 *
 * Order is a flat `position` on each question and stays that way — a section is
 * a label, not a container. These helpers turn that flat list into the grouped
 * view the sidebar draws, and turn a drag in that view back into a flat order.
 *
 * Kept free of React and of the API types so the reordering arithmetic can be
 * tested on its own; it is the part most likely to be wrong in a way nobody
 * notices until a student sits the paper.
 */

/** Anything with an id that may belong to a section. */
export interface Placed {
  id: string;
  sectionId: string | null;
}

export interface Identified {
  id: string;
}

export interface QuestionGroup<Q extends Placed, S extends Identified> {
  section: S | null;
  items: {
    question: Q;
    /** Place in the whole paper — what the teacher reads as "Q7". */
    index: number;
    /** Place among its neighbours, which is what the arrows step through. */
    indexInGroup: number;
  }[];
}

/**
 * Sections in their own order, each carrying its questions in paper order, and
 * an unnamed group at the end for questions that belong to no section.
 *
 * The trailing group is dropped when empty — an empty "No section" heading is
 * noise. An empty *named* section is kept: the teacher just made it and is
 * about to fill it.
 */
export const groupBySection = <Q extends Placed, S extends Identified>(
  sections: readonly S[],
  questions: readonly Q[],
): QuestionGroup<Q, S>[] =>
  [...sections.map((section) => section as S | null), null]
    .map((section) => ({
      section,
      items: questions
        .map((question, index) => ({ question, index }))
        .filter(({ question }) => question.sectionId === (section?.id ?? null))
        .map((entry, indexInGroup) => ({ ...entry, indexInGroup })),
    }))
    .filter((group) => group.section !== null || group.items.length > 0);

/**
 * The flat order the grouped view is showing, top to bottom.
 *
 * Not always the same as the stored order: nothing has ever stopped a paper
 * from interleaving sections (Q1 in A, Q2 in B, Q3 in A), and such a paper
 * reads correctly in the sidebar while giving students a heading that appears,
 * disappears and comes back. Sending this on every drag quietly settles that —
 * what the teacher sees becomes what the paper is.
 */
export const orderOf = <Q extends Placed, S extends Identified>(
  groups: readonly QuestionGroup<Q, S>[],
): string[] => groups.flatMap((group) => group.items.map(({ question }) => question.id));

export interface DropTarget {
  /** Section the question is being dropped into, or null for no section. */
  sectionId: string | null;
  /**
   * Question it should sit above, or null to put it last in that section.
   */
  beforeId: string | null;
}

export interface MoveResult {
  /** Every question id in its new order, which is what the server expects. */
  questionIds: string[];
  /** Set when the question changed section, so the caller knows to reassign. */
  sectionId: string | null | undefined;
}

/**
 * Where the paper ends up after dragging one question onto a drop target.
 *
 * Returns the whole order rather than a pair to swap: the reorder endpoint
 * validates a full permutation, and a cross-section move is not a swap in any
 * case — it is a removal and an insertion somewhere else entirely.
 */
export const moveTo = <Q extends Placed, S extends Identified>(
  groups: readonly QuestionGroup<Q, S>[],
  questionId: string,
  target: DropTarget,
): MoveResult | null => {
  const order = orderOf(groups);
  if (!order.includes(questionId)) return null;

  // Dropping a question onto itself is a no-op, not a move to nowhere.
  if (target.beforeId === questionId) return null;

  const current = groups
    .flatMap((group) => group.items)
    .find(({ question }) => question.id === questionId);
  if (current === undefined) return null;

  const withoutMoved = order.filter((id) => id !== questionId);

  let at: number;
  if (target.beforeId !== null) {
    const found = withoutMoved.indexOf(target.beforeId);
    // A target that isn't there any more means the view moved under the drag.
    if (found === -1) return null;
    at = found;
  } else {
    // Last in the target section, which is the end of that section's run in
    // the flat order — not the end of the paper.
    const section = groups.find((group) => (group.section?.id ?? null) === target.sectionId);
    const last = section?.items.at(-1)?.question.id;
    const lastId = last === questionId ? section?.items.at(-2)?.question.id : last;
    at = lastId === undefined ? withoutMoved.length : withoutMoved.indexOf(lastId) + 1;
  }

  const questionIds = [...withoutMoved.slice(0, at), questionId, ...withoutMoved.slice(at)];

  const changed = current.question.sectionId !== target.sectionId;
  return { questionIds, sectionId: changed ? target.sectionId : undefined };
};
