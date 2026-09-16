"use client";
import { Select } from "@/components/primitives";

import { filterToolbarFieldStackClassName, filterToolbarLabelClassName, type FilterFieldLayout } from "@/components/filters/filter-toolbar";
import { filterParamsBody, queryParamOptions } from "@/types/api";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useGetAllEntitiesQuery } from "./entity-combobox";

export type EntitySelectEmptyOption = { value: string; label: string };

/**
 * Base UI Select locks controlled mode on first render (`value !== undefined`).
 * Passing `undefined` while empty then a string after form reset leaves the
 * select stuck uncontrolled (placeholder forever). Always return `null` when empty.
 */
export function resolveEntitySelectValue(
  value: number,
  emptyOption?: EntitySelectEmptyOption,
): string | null {
  if (value > 0) return String(value);
  if (emptyOption) return emptyOption.value;
  return null;
}

export function buildEntitySelectItems(opts: {
  rows: any[];
  displayFunction: (entity: any) => string;
  value: number;
  isLoading: boolean;
  emptyOption?: EntitySelectEmptyOption;
}): { value: string; label: string }[] {
  const { rows, displayFunction, value, isLoading, emptyOption } = opts;
  const hasValueInOptions =
    value > 0 && rows.some((r) => Number(r.id) === Number(value));
  const needsIdFallback = value > 0 && !hasValueInOptions;

  const items = rows.map((c: any) => ({
    value: String(c.id),
    label: displayFunction(c),
  }));

  if (needsIdFallback) {
    items.unshift({
      value: String(value),
      label: isLoading ? "Loading name…" : `ID ${String(value)} (not in list)`,
    });
  }

  if (emptyOption) {
    items.unshift({
      value: emptyOption.value,
      label: emptyOption.label,
    });
  }

  return items;
}

interface IEntitySelectProps {
  displayFunction: (entity: any) => string;
  entity: string;
  value: number;
  onChange: (v: number) => void;
  label: string;
  isRequired?: boolean;
  formDescription?: React.ReactNode;
  disabled?: boolean;
  filterParams?: filterParamsBody;
  queryParams?: queryParamOptions;
  emptyOption?: EntitySelectEmptyOption;
  placeholder?: string;
  hideLabel?: boolean;
  containerClassName?: string;
  layout?: FilterFieldLayout;
}

const EntitySelect: React.FC<IEntitySelectProps> = ({
  displayFunction,
  entity,
  value,
  onChange,
  label,
  isRequired = false,
  formDescription,
  disabled = false,
  filterParams,
  queryParams,
  emptyOption,
  placeholder,
  hideLabel = false,
  containerClassName,
  layout = "form",
}) => {
  const getAllEntities = useGetAllEntitiesQuery(
    entity,
    queryParams,
    filterParams,
  );
  const rows: any[] = getAllEntities.data?.data?.data ?? [];

  const items = useMemo(
    () =>
      buildEntitySelectItems({
        rows,
        displayFunction,
        value,
        isLoading: getAllEntities.isLoading,
        emptyOption,
      }),
    [
      rows,
      displayFunction,
      value,
      getAllEntities.isLoading,
      emptyOption,
    ],
  );

  const showLabel = !hideLabel && Boolean(label);
  const isToolbar = layout === "toolbar";

  return (
    <div
      className={cn(
        showLabel &&
          (isToolbar
            ? filterToolbarFieldStackClassName()
            : "flex flex-col gap-2"),
        containerClassName,
      )}
    >
      {showLabel ? (
        <label
          className={
            isToolbar
              ? filterToolbarLabelClassName()
              : "text-sm font-medium text-text-secondary"
          }
        >
          {label}{" "}
          {isRequired ? <span className=" text-destructive">*</span> : null}
        </label>
      ) : null}
      <Select
        value={resolveEntitySelectValue(value, emptyOption)}
        onValueChange={(v) => {
          if (v == null) return;
          if (emptyOption && v === emptyOption.value) {
            onChange(0);
            return;
          }
          if (v === "") {
            onChange(0);
            return;
          }
          const n = Number(v);
          if (Number.isNaN(n) || n <= 0) return;
          onChange(n);
        }}
        disabled={disabled || getAllEntities.isLoading}
        className={
          isToolbar ? "w-full min-w-0" : "w-full max-w-xl min-w-0"
        }
        placeholder={
          getAllEntities.isLoading
            ? "Loading…"
            : (placeholder ?? "Select")
        }
        items={items}
      />
      {formDescription ? <p>{formDescription}</p> : null}
    </div>
  );
};

export default EntitySelect;
