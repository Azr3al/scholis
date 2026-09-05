"use client";
import { Switch } from "@/components/primitives";

import { useCallback, useMemo } from "react";

import useImportStore from "@/store/import-store";
import {
  matchableMappedColumns,
  importFieldLabel,
  type MatchableColumn,
} from "@/lib/imports/wizard-logic";
import { useImportFields } from "@/hooks/imports/use-import-fields";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DotsGrid3x3 as GripVertical, Group as Users } from "iconoir-react";

const FIELD_DB_TARGETS: Record<string, string> = {
  email: "all email fields",
  communication_email: "all email fields",
  phone_number: "all phone fields",
  emergency_contact_phone_number: "all phone fields",
};

type MatchRowProps = {
  col: MatchableColumn;
  index: number;
  label: string;
  config: { match: boolean; fuzzy: boolean };
  onChange: (patch: { match?: boolean; fuzzy?: boolean }) => void;
};

function SortableMatchRow({ col, index, label, config, onChange }: MatchRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: col.fieldKey });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 50 : 0,
      }}
      className="flex items-center gap-4 bg-white px-4 py-3 dark:bg-slate-950"
    >
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <button
          type="button"
          aria-label="Drag to reorder priority"
          {...attributes}
          {...listeners}
          className="cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing dark:hover:text-slate-200"
          style={{ touchAction: "none" }}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="tabular-nums">{index + 1}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{label}</p>
        <p className="text-xs text-slate-500">
          Searches {FIELD_DB_TARGETS[col.fieldKey] ?? "matching fields"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500">Match</label>
        <Switch
          checked={config.match}
          onCheckedChange={(v) =>
            onChange({ match: v, fuzzy: v ? config.fuzzy : false })
          }
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500">Catch typos</label>
        <Switch
          checked={config.fuzzy}
          disabled={!config.match}
          onCheckedChange={(v) => onChange({ fuzzy: v })}
        />
      </div>
    </li>
  );
}

export function MatchConfigPanel() {
  const parse = useImportStore((s) => s.parse);
  const mapping = useImportStore((s) => s.mapping);
  const roleValue = useImportStore((s) => s.role);
  const matchConfig = useImportStore((s) => s.matchConfig);
  const matchPriority = useImportStore((s) => s.matchPriority);
  const setMatchColumn = useImportStore((s) => s.setMatchColumn);
  const setMatchPriority = useImportStore((s) => s.setMatchPriority);
  const { data: fields = [] } = useImportFields(roleValue, Boolean(parse));

  const columns = useMemo(() => {
    const cols = matchableMappedColumns(mapping);
    return [...cols].sort(
      (a, b) =>
        (matchPriority.indexOf(a.fieldKey) + 1 || 99) -
        (matchPriority.indexOf(b.fieldKey) + 1 || 99),
    );
  }, [mapping, matchPriority]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const order = columns.map((c) => c.fieldKey);
      const oldIndex = order.indexOf(String(active.id));
      const newIndex = order.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(order, oldIndex, newIndex);
      const rest = matchPriority.filter((key) => !reordered.includes(key));
      setMatchPriority([...reordered, ...rest]);
    },
    [columns, matchPriority, setMatchPriority],
  );

  if (columns.length === 0) return null;

  const sortableIds = columns.map((c) => c.fieldKey);

  return (
    <section className="rounded-xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-950">
      <header className="flex items-center gap-2 px-4 py-3">
        <Users className="size-4 text-slate-500" strokeWidth={1.5} />
        <div>
          <h3 className="text-sm font-medium tracking-tight">Match existing users</h3>
          <p className="text-xs text-slate-500">
            We&apos;ll look for people already in the system. Every match needs your
            confirmation in the next step.
          </p>
        </div>
      </header>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <ul className="m-0 list-none divide-y divide-slate-100 p-0 dark:divide-slate-800">
            {columns.map((col, idx) => (
              <SortableMatchRow
                key={col.fieldKey}
                col={col}
                index={idx}
                label={importFieldLabel(fields, col.fieldKey)}
                config={matchConfig[col.fieldKey] ?? { match: false, fuzzy: false }}
                onChange={(patch) => setMatchColumn(col.fieldKey, patch)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="px-4 pb-3 text-xs text-slate-400">
        Drag to set priority &middot; &ldquo;Catch typos&rdquo; flags close matches —
        stricter than course matching.
      </p>
    </section>
  );
}
