"use client";

import { DocumentInsertStack } from "@/components/document-editor/document-insert-stack";
import { Button, Select, useToast } from "@/components/primitives";
import {
  defaultImageBlock,
  defaultTextBlock,
  findBlock,
  insertBlock,
  insertColumnChild,
  insertVariable,
  moveBlock,
  removeBlock,
  replaceBlock,
} from "@/lib/document-template/insert";
import {
  SAMPLE_BINDER,
  SAMPLE_GRADE_ROWS,
  TABLE_COLUMN_OPTIONS,
} from "@/lib/document-template/sample-binder";
import { splitTokenRuns } from "@/lib/document-template/tokens";
import type {
  BlockDocument,
  ColumnChild,
  DocumentBlock,
  DocumentPagePreset,
  GradesTableBlock,
  ImageBlock,
  InsertableBlockType,
  TextBlock,
} from "@/lib/document-template/types";
import { uploadDocumentTemplateAsset } from "@/lib/documents-api";
import { NavArrowDown, NavArrowUp, Trash } from "iconoir-react";
import { useRef, useState } from "react";

const PAGE_PRESETS: Record<
  Exclude<DocumentPagePreset, "custom">,
  { width: number; height: number }
> = {
  a4_portrait: { width: 210, height: 297 },
  a4_landscape: { width: 297, height: 210 },
  letter_portrait: { width: 215.9, height: 279.4 },
};

export function DocumentPage({
  templateId,
  document,
  onChange,
  selectedId,
  onSelect,
}: {
  templateId: number;
  document: BlockDocument;
  onChange: (next: BlockDocument) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const toast = useToast();
  const [caret, setCaret] = useState<{ blockId: string; offset: number } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingImageId = useRef<string | null>(null);

  const handleInsert = (type: InsertableBlockType) => {
    onChange(insertBlock(document, type));
  };

  const handleVariable = (key: string) => {
    if (!caret) return;
    const block = findBlock(document, caret.blockId);
    if (!block || block.type !== "text") return;
    const next = insertVariable(block.text, caret.offset, key);
    onChange(replaceBlock(document, { ...block, text: next.text }));
    setCaret({ blockId: block.id, offset: next.caret });
  };

  const pickImage = (blockId: string) => {
    pendingImageId.current = blockId;
    fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    const blockId = pendingImageId.current;
    pendingImageId.current = null;
    if (!file || !blockId) return;
    try {
      const { url } = await uploadDocumentTemplateAsset(templateId, file);
      const block = findBlock(document, blockId);
      if (!block || block.type !== "image") return;
      onChange(replaceBlock(document, { ...block, url }));
    } catch {
      toast.add({ type: "error", title: "Could not upload image." });
    }
  };

  const page = document.page;
  const widthMm = page.width;
  const heightMm = page.height;

  return (
    <div className="relative mx-auto flex min-h-full justify-center px-20 py-10">
      <div className="sticky top-10 self-start">
        <DocumentInsertStack
          onInsert={handleInsert}
          onInsertVariable={handleVariable}
          variablesEnabled={Boolean(caret)}
        />
      </div>
      <div className="ml-6">
        <label className="mb-3 flex items-center gap-2 text-xs text-text-muted">
          Page
          <Select
            value={page.preset === "custom" ? "custom" : page.preset}
            onValueChange={(value) => {
              if (value === "custom") {
                onChange({
                  ...document,
                  page: { ...page, preset: "custom" },
                });
                return;
              }
              const preset = value as Exclude<DocumentPagePreset, "custom">;
              const size = PAGE_PRESETS[preset];
              onChange({
                ...document,
                page: { preset, width: size.width, height: size.height, unit: "mm" },
              });
            }}
            items={[
              { value: "a4_portrait", label: "A4 portrait" },
              { value: "a4_landscape", label: "A4 landscape" },
              { value: "letter_portrait", label: "Letter portrait" },
              { value: "custom", label: "Custom" },
            ]}
          />
        </label>
        <div
          className="bg-white p-10 text-black shadow-md"
          style={{
            width: `${widthMm}mm`,
            minHeight: `${heightMm}mm`,
            aspectRatio: `${widthMm} / ${heightMm}`,
          }}
          onClick={() => {
            onSelect(null);
            setCaret(null);
          }}
        >
          <div className="flex flex-col gap-4">
            {document.blocks.map((block, index) => (
              <BlockFrame
                key={block.id}
                selected={selectedId === block.id}
                onSelect={() => onSelect(block.id)}
                onUp={
                  index > 0
                    ? () => onChange(moveBlock(document, block.id, -1))
                    : undefined
                }
                onDown={
                  index < document.blocks.length - 1
                    ? () => onChange(moveBlock(document, block.id, 1))
                    : undefined
                }
                onDelete={() => {
                  onChange(removeBlock(document, block.id));
                }}
              >
                <BlockBody
                  block={block}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onChangeBlock={(next) => onChange(replaceBlock(document, next))}
                  onCaret={setCaret}
                  onAddColumnChild={(columnIndex, type) => {
                    onChange(
                      insertColumnChild(
                        document,
                        block.id,
                        columnIndex,
                        type === "text" ? defaultTextBlock() : defaultImageBlock(),
                      ),
                    );
                  }}
                  onPickImage={pickImage}
                />
              </BlockFrame>
            ))}
          </div>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void onFile(file);
        }}
      />
    </div>
  );
}

function BlockFrame({
  selected,
  onSelect,
  onUp,
  onDown,
  onDelete,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={selected ? "relative rounded ring-2 ring-blue-400" : "relative"}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {selected ? (
        <div className="absolute -right-10 top-0 flex flex-col gap-1">
          {onUp ? (
            <Button type="button" variant="ghost" size="sm" className="size-8 px-0" aria-label="Move up" onClick={onUp}>
              <NavArrowUp width={14} height={14} />
            </Button>
          ) : null}
          {onDown ? (
            <Button type="button" variant="ghost" size="sm" className="size-8 px-0" aria-label="Move down" onClick={onDown}>
              <NavArrowDown width={14} height={14} />
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" className="size-8 px-0" aria-label="Delete block" onClick={onDelete}>
            <Trash width={14} height={14} />
          </Button>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function BlockBody({
  block,
  selectedId,
  onSelect,
  onChangeBlock,
  onCaret,
  onAddColumnChild,
  onPickImage,
}: {
  block: DocumentBlock;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChangeBlock: (next: DocumentBlock | ColumnChild) => void;
  onCaret: (caret: { blockId: string; offset: number } | null) => void;
  onAddColumnChild: (columnIndex: 0 | 1, type: "text" | "image") => void;
  onPickImage: (id: string) => void;
}) {
  if (block.type === "text") {
    return (
      <TextBlockView
        block={block}
        selected={selectedId === block.id}
        onChange={onChangeBlock}
        onCaret={onCaret}
      />
    );
  }
  if (block.type === "image") {
    return <ImageBlockView block={block} onPick={() => onPickImage(block.id)} />;
  }
  if (block.type === "columns") {
    return (
      <div className="grid grid-cols-2 gap-4">
        {([0, 1] as const).map((columnIndex) => (
          <div key={columnIndex} className="min-h-24 border border-dashed border-neutral-300 p-2">
            {block.columns[columnIndex].map((child) => (
              <div
                key={child.id}
                className={selectedId === child.id ? "rounded ring-1 ring-blue-400" : ""}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(child.id);
                }}
              >
                {child.type === "text" ? (
                  <TextBlockView
                    block={child}
                    selected={selectedId === child.id}
                    onChange={onChangeBlock}
                    onCaret={onCaret}
                  />
                ) : (
                  <ImageBlockView block={child} onPick={() => onPickImage(child.id)} />
                )}
              </div>
            ))}
            <div className="mt-2 flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => onAddColumnChild(columnIndex, "text")}>
                Text
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onAddColumnChild(columnIndex, "image")}>
                Image
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <GradesTableView
      block={block}
      selected={selectedId === block.id}
      onChange={onChangeBlock}
    />
  );
}

function TextBlockView({
  block,
  selected,
  onChange,
  onCaret,
}: {
  block: TextBlock;
  selected: boolean;
  onChange: (next: TextBlock) => void;
  onCaret: (caret: { blockId: string; offset: number } | null) => void;
}) {
  const style = {
    fontFamily: block.fontFamily ?? "Noto Sans",
    fontSize: `${block.fontSize ?? 12}pt`,
    color: block.color ?? "#111111",
    textAlign: block.align,
    fontWeight: block.bold ? 700 : 400,
    fontStyle: block.italic ? "italic" : "normal",
  } as const;

  if (selected) {
    return (
      <textarea
        className="w-full resize-none bg-transparent outline-none"
        style={style}
        rows={Math.max(2, block.text.split("\n").length)}
        value={block.text}
        onChange={(event) => {
          onChange({ ...block, text: event.target.value });
          onCaret({ blockId: block.id, offset: event.target.selectionStart });
        }}
        onSelect={(event) => {
          const target = event.target as HTMLTextAreaElement;
          onCaret({ blockId: block.id, offset: target.selectionStart });
        }}
        onFocus={(event) => {
          onCaret({ blockId: block.id, offset: event.target.selectionStart });
        }}
      />
    );
  }

  const runs = splitTokenRuns(block.text);
  return (
    <p className="min-h-6 whitespace-pre-wrap" style={style}>
      {runs.length === 0 ? (
        <span className="text-neutral-400">Text</span>
      ) : (
        runs.map((run, index) =>
          run.kind === "text" ? (
            <span key={index}>{run.text}</span>
          ) : (
            <span
              key={index}
              className="rounded bg-amber-100 px-1 text-amber-900"
            >
              {SAMPLE_BINDER[run.key] ?? run.raw}
            </span>
          ),
        )
      )}
    </p>
  );
}

function ImageBlockView({
  block,
  onPick,
}: {
  block: ImageBlock;
  onPick: () => void;
}) {
  if (!block.url) {
    return (
      <button
        type="button"
        className="flex h-24 w-full items-center justify-center border border-dashed border-neutral-400 text-sm text-neutral-500"
        onClick={onPick}
      >
        Add image
      </button>
    );
  }
  return (
    <button type="button" className="block w-full" onClick={onPick}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.url}
        alt=""
        className="max-w-full"
        style={{ width: `${block.width}mm` }}
      />
    </button>
  );
}

function GradesTableView({
  block,
  selected,
  onChange,
}: {
  block: GradesTableBlock;
  selected: boolean;
  onChange: (next: GradesTableBlock) => void;
}) {
  const unused = TABLE_COLUMN_OPTIONS.filter(
    (option) => !block.columns.some((col) => col.key === option.key),
  );
  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {block.columns.map((col) => (
              <th key={col.key} className="border border-neutral-300 px-2 py-1 text-left">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SAMPLE_GRADE_ROWS.map((row, index) => (
            <tr key={index}>
              {block.columns.map((col) => (
                <td key={col.key} className="border border-neutral-300 px-2 py-1">
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {selected ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {unused.map((option) => (
            <Button
              key={option.key}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                onChange({
                  ...block,
                  columns: [...block.columns, option],
                })
              }
            >
              Add {option.label}
            </Button>
          ))}
          {block.columns.map((col) => (
            <Button
              key={col.key}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange({
                  ...block,
                  columns: block.columns.filter((item) => item.key !== col.key),
                })
              }
            >
              Remove {col.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
