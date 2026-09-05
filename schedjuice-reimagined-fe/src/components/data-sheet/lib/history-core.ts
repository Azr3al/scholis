export interface CellChange {
  row: number;
  field: string;
  before: string;
  after: string;
}

export interface RowSnapshot {
  row: number;
  values: Record<string, string>;
}

export type StructuralChange =
  | { kind: "append"; rows: number[] }
  | { kind: "remove"; rows: number[]; snapshots?: RowSnapshot[] };

export interface Transaction {
  label: string;
  cells: CellChange[];
  structural?: StructuralChange[];
}

export interface HistoryState {
  undo: Transaction[];
  redo: Transaction[];
  limit: number;
}

export function createHistoryState(limit = 100): HistoryState {
  return { undo: [], redo: [], limit };
}

export function pushTransaction(
  state: HistoryState,
  tx: Transaction,
): HistoryState {
  const undo = [...state.undo, tx];
  while (undo.length > state.limit) undo.shift();
  return { ...state, undo, redo: [] };
}

function invertStructural(change: StructuralChange): StructuralChange {
  if (change.kind === "append") {
    return { kind: "remove", rows: change.rows };
  }
  return { kind: "append", rows: change.rows };
}

export function invertTransaction(tx: Transaction): Transaction {
  return {
    label: tx.label,
    cells: tx.cells.map((c) => ({
      row: c.row,
      field: c.field,
      before: c.after,
      after: c.before,
    })),
    structural: tx.structural?.map(invertStructural),
  };
}
