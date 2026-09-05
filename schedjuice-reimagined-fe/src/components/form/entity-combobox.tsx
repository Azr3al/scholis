"use client";
import { Button, useToast } from "@/components/primitives";

import { searchEntities } from "@/app/client-api/utils";
import { filterParamsBody, queryParamOptions } from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  EntityComboboxList,
  type EntityComboboxOption,
} from "./entity-combobox-list";
import { useDebouncedFetchOptions } from "./use-debounced-fetch-options";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/primitives/dialog";
import { Field } from "@/components/primitives/field";
import { Input } from "@/components/primitives/input";
import { Plus } from "iconoir-react";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import {
  filterToolbarFieldStackClassName,
  filterToolbarLabelClassName,
  type FilterFieldLayout,
} from "@/components/filters/filter-toolbar";
import { cn } from "@/lib/utils";

export type { EntityComboboxOption };

/** Stable default so React Query key does not change every render when `filterParams` is omitted. */
const EMPTY_ENTITY_FILTER_PARAMS: filterParamsBody = {
  filter_params: [],
  exclude_params: [],
};

/**
 * List/search responses must include the primary key so combobox value + default selection work.
 * Callers often pass `fields` tailored for display and omit `id`; that yields rows without `id`
 * and `onChange(undefined)` → `"undefined"` in URL/state.
 */
export function mergeEntityListQueryParams(
  queryParams: queryParamOptions | undefined,
): queryParamOptions | undefined {
  if (!queryParams) return queryParams;
  const raw = queryParams.fields;
  const fields =
    raw && raw.length > 0 ? Array.from(new Set([...raw, "id"])) : raw;
  return { ...queryParams, fields };
}

export function getGetAllEntitiesQueryKey(
  entity: string,
  queryParams?: queryParamOptions,
  filterParams?: filterParamsBody,
) {
  const resolvedFilterParams = filterParams ?? EMPTY_ENTITY_FILTER_PARAMS;
  return [
    "getAllEntities",
    entity,
    JSON.stringify(resolvedFilterParams),
    JSON.stringify(queryParams ?? {}),
  ] as const;
}

/**
 * Shared search query for entity comboboxes. Callers with the same `entity`, `queryParams`, and
 * `filterParams` share one React Query cache entry (single network request).
 */
export function useGetAllEntitiesQuery(
  entity: string,
  queryParams: queryParamOptions | undefined,
  filterParams?: filterParamsBody,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchOnMount?: boolean | "always";
  },
) {
  const resolvedFilterParams = filterParams ?? EMPTY_ENTITY_FILTER_PARAMS;
  const queryParamsResolved = mergeEntityListQueryParams(queryParams);
  return useQuery({
    queryKey: getGetAllEntitiesQueryKey(
      entity,
      queryParamsResolved,
      filterParams,
    ),
    queryFn: () =>
      searchEntities(
        entity,
        {
          ...queryParams,
          size: -1,
          fields: queryParamsResolved?.fields,
        },
        resolvedFilterParams,
      ),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime,
    refetchOnMount: options?.refetchOnMount,
  });
}

export type EntityComboboxCreateNewConfig = {
  buttonLabel: string;
  dialogTitle: string;
  inputLabel: string;
  inputPlaceholder?: string;
  /** Returns the new row’s primary key (e.g. POST response id). */
  create: (title: string) => Promise<number>;
};

type EntityComboboxSharedProps = {
  value?: string;
  onChange: (v: string) => void;
  label: string;
  formDescription?: React.ReactNode;
  disabled?: boolean;
  containerClassName?: string;
  comboboxPlaceholder?: string;
  comboboxTriggerClassName?: string;
  comboboxContentClassName?: string;
  allowDeselect?: boolean;
  /** Screen-reader-only label; no visible label or extra vertical spacing. */
  hideLabel?: boolean;
  layout?: FilterFieldLayout;
  loadingPlaceholder?: string;
  loadingPlaceholderActive?: boolean;
};

type EntityComboboxEntityModeProps = EntityComboboxSharedProps & {
  displayFunction: (entity: any) => string;
  /** Optional text used for client-side filtering when it should differ from the display label. */
  searchFunction?: (entity: any) => string;
  entity: string;
  filterParams?: filterParamsBody;
  queryParams?: queryParamOptions;
  canSetDefaultValue?: boolean;
  customComponent?: <T>(data: T[], currentId: string) => React.ReactNode;
  onSelectedEntityChange?: (entity: any) => void;
  /** Optional first row (e.g. `{ value: "", label: "No category" }`) for nullable FKs. */
  emptyOption?: { value: string; label: string };
  /** Button beside the combobox opens a dialog; on success the list refetches and the new id is selected. */
  onCreateNew?: EntityComboboxCreateNewConfig;
  fetchOptions?: never;
  debounceMilliseconds?: never;
  cacheMilliseconds?: never;
  initialSearchValue?: never;
  selectedLabel?: never;
  isSaving?: never;
  variant?: never;
  widthClassName?: never;
};

type EntityComboboxFetchModeProps = EntityComboboxSharedProps & {
  fetchOptions: (searchValue: string) => Promise<EntityComboboxOption[]>;
  initialSearchValue?: string;
  debounceMilliseconds?: number;
  cacheMilliseconds?: number;
  isSaving?: boolean;
  widthClassName?: string;
  variant?: "combobox" | "search";
  /** Shown when `value` is set but the option is not yet in the fetched list. */
  selectedLabel?: string;
  entity?: never;
  displayFunction?: never;
  searchFunction?: never;
  filterParams?: never;
  queryParams?: never;
  canSetDefaultValue?: never;
  customComponent?: never;
  onSelectedEntityChange?: never;
  emptyOption?: never;
  onCreateNew?: never;
};

export type EntityComboboxProps =
  | EntityComboboxEntityModeProps
  | EntityComboboxFetchModeProps;

function EntityComboboxFetchMode({
  value,
  onChange,
  label,
  formDescription,
  disabled = false,
  containerClassName,
  comboboxPlaceholder,
  comboboxTriggerClassName,
  comboboxContentClassName,
  allowDeselect = true,
  hideLabel = false,
  layout = "form",
  fetchOptions,
  initialSearchValue = "",
  debounceMilliseconds = 700,
  cacheMilliseconds = 60_000,
  isSaving = false,
  widthClassName = "w-[260px]",
  variant = "combobox",
  selectedLabel,
  loadingPlaceholder,
  loadingPlaceholderActive,
}: EntityComboboxFetchModeProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(initialSearchValue);
  const { options, isLoading, fetchError, clearFetchError } =
    useDebouncedFetchOptions({
      fetchOptions,
      enabled: open,
      searchValue,
      initialSearchValue,
      debounceMilliseconds,
      cacheMilliseconds,
    });

  const isToolbar = layout === "toolbar";
  const placeholder = comboboxPlaceholder;
  const triggerClassName = cn(widthClassName, comboboxTriggerClassName);
  const contentClassName = cn(widthClassName, comboboxContentClassName);

  return (
    <div
      className={cn(
        isToolbar ? "min-w-0 max-w-full" : "min-w-56 max-w-full",
        containerClassName,
      )}
    >
      <div
        className={cn(
          "flex flex-col",
          !hideLabel && (isToolbar ? filterToolbarFieldStackClassName() : "space-y-2"),
        )}
      >
        {label && !hideLabel ? (
          <label
            className={
              isToolbar ? filterToolbarLabelClassName() : "text-sm text-text-secondary"
            }
          >
            {label}
          </label>
        ) : null}
        {label && hideLabel ? <span className="sr-only">{label}</span> : null}
        <EntityComboboxList
          disabled={disabled}
          isLoading={isLoading}
          isSaving={isSaving}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={onChange}
          options={options}
          label={label}
          placeholder={placeholder}
          triggerClassName={triggerClassName}
          contentClassName={contentClassName}
          allowDeselect={allowDeselect}
          selectedLabel={selectedLabel}
          serverSideFilter
          onFilterChange={(next) => {
            setSearchValue(next);
            clearFetchError();
          }}
          onOpenChange={setOpen}
          layout={layout}
          variant={variant}
          error={fetchError}
          triggerAriaLabel={hideLabel ? (placeholder ?? label) : undefined}
          loadingPlaceholder={loadingPlaceholder}
          loadingPlaceholderActive={loadingPlaceholderActive}
        />
        {formDescription && (
          <p className="text-sm text-text-muted">{formDescription}</p>
        )}
      </div>
    </div>
  );
}

function EntityComboboxEntityMode({
  displayFunction,
  searchFunction,
  entity,
  value,
  onChange,
  label,
  formDescription,
  disabled = false,
  filterParams,
  queryParams,
  canSetDefaultValue = false,
  customComponent,
  onSelectedEntityChange,
  containerClassName,
  emptyOption,
  onCreateNew,
  comboboxPlaceholder,
  comboboxTriggerClassName,
  comboboxContentClassName,
  allowDeselect = true,
  hideLabel = false,
  layout = "form",
  loadingPlaceholder,
  loadingPlaceholderActive,
}: EntityComboboxEntityModeProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const createInputId = useId();
  const [renderCount, setRenderCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const getAllEntities = useGetAllEntitiesQuery(entity, queryParams, filterParams);

  const createMutation = useMutation({
    mutationFn: (title: string) => {
      if (!onCreateNew) {
        return Promise.reject(new Error("Create is not enabled"));
      }
      return onCreateNew.create(title);
    },
    onSuccess: async (newId) => {
      await queryClient.invalidateQueries({
        queryKey: getGetAllEntitiesQueryKey(
          entity,
          mergeEntityListQueryParams(queryParams),
          filterParams,
        ),
      });
      onChange(String(newId));
      setCreateOpen(false);
      setNewTitle("");
      toast.add({ description: "Created." });
    },
    onError: (error: unknown) => {
      toast.add({
        type: "error",
        description: parseSchedjuiceApiError(error, "Could not create."),
      });
    },
  });

  useEffect(() => {
    if (
      getAllEntities.isSuccess &&
      getAllEntities.data &&
      !disabled &&
      !value &&
      renderCount === 0 &&
      canSetDefaultValue &&
      !emptyOption
    ) {
      const first = getAllEntities.data.data.data[0];
      if (
        first != null &&
        first.id != null &&
        isValidApiEntityIdParam(String(first.id))
      ) {
        onChange(String(first.id));
      }
    }
  }, [getAllEntities.isSuccess, getAllEntities.data]);

  const selectedEntity = getAllEntities.data?.data?.data?.find(
    (e: { id: number }) => String(e.id) === String(value),
  );
  const onSelectedEntityChangeRef = useRef(onSelectedEntityChange);
  onSelectedEntityChangeRef.current = onSelectedEntityChange;
  useEffect(() => {
    onSelectedEntityChangeRef.current?.(value && selectedEntity ? selectedEntity : null);
  }, [value, selectedEntity]);

  const listOptions = getAllEntities.data?.data.data
    ?.filter(
      (c: { id?: unknown }) =>
        c != null &&
        c.id != null &&
        isValidApiEntityIdParam(String(c.id)),
    )
    ?.map((c: { id: number | string }) => ({
      value: String(c.id),
      label: displayFunction(c),
      ...(searchFunction
        ? { searchText: searchFunction(c) }
        : {}),
    }));

  const options = emptyOption
    ? [
        { value: emptyOption.value, label: emptyOption.label },
        ...(listOptions ?? []),
      ]
    : listOptions;

  const comboboxValue =
    value === undefined || value === null ? "" : String(value);

  const isToolbar = layout === "toolbar";

  const comboboxBlock = (
    <EntityComboboxList
      disabled={disabled}
      isLoading={getAllEntities.isLoading}
      value={comboboxValue}
      onChange={(v) => {
        onChange(v);
        setRenderCount(renderCount + 1);
      }}
      options={options}
      label={label}
      placeholder={comboboxPlaceholder}
      triggerClassName={cn("w-full min-w-56", comboboxTriggerClassName)}
      contentClassName={comboboxContentClassName}
      allowDeselect={allowDeselect}
      layout={layout}
      triggerAriaLabel={hideLabel ? (comboboxPlaceholder ?? label) : undefined}
      loadingPlaceholder={loadingPlaceholder}
      loadingPlaceholderActive={loadingPlaceholderActive}
    />
  );

  return (
    <div
      className={cn(
        isToolbar ? "min-w-0 max-w-full" : "min-w-56 max-w-full",
        containerClassName,
      )}
    >
      <div
        className={cn(
          "flex flex-col",
          !hideLabel && (isToolbar ? filterToolbarFieldStackClassName() : "space-y-2"),
        )}
      >
        {label && !hideLabel ? (
          <label className={isToolbar ? filterToolbarLabelClassName() : "text-sm text-text-secondary"}>
            {label}
          </label>
        ) : null}
        {label && hideLabel ? (
          <span className="sr-only">{label}</span>
        ) : null}
        <div
          className={cn(
            "flex flex-col gap-2",
            onCreateNew && "sm:flex-row sm:items-center sm:gap-3",
          )}
        >
          <div className={cn("min-w-0 flex-1", onCreateNew && "w-full")}>
            {comboboxBlock}
          </div>
          {onCreateNew && (
            <Button
              type="button"
              variant="secondary"
              className="h-8 shrink-0"
              disabled={disabled}
              onClick={() => setCreateOpen(true)}
            >
              <Plus width={16} height={16} aria-hidden />
              {onCreateNew.buttonLabel}
            </Button>
          )}
        </div>
        {onCreateNew && (
          <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
            <Dialog.Portal>
              <Dialog.Backdrop />
              <Dialog.Popup className="w-full max-w-md">
                <Dialog.Title>{onCreateNew.dialogTitle}</Dialog.Title>
                <Field.Root className="space-y-2 py-2">
                  <Field.Label htmlFor={createInputId}>
                    {onCreateNew.inputLabel}
                  </Field.Label>
                  <Input
                    id={createInputId}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={onCreateNew.inputPlaceholder}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const t = newTitle.trim();
                        if (t) createMutation.mutate(t);
                      }
                    }}
                  />
                </Field.Root>
                <div className="flex justify-end gap-2">
                  <Dialog.Close render={<Button variant="ghost">Cancel</Button>} />
                  <Button
                    type="button"
                    isLoading={createMutation.isPending}
                    onClick={() => {
                      const t = newTitle.trim();
                      if (!t) return;
                      createMutation.mutate(t);
                    }}
                  >
                    Create
                  </Button>
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        )}
        {formDescription && (
          <p className="text-sm text-text-muted">{formDescription}</p>
        )}
      </div>
      {value &&
        getAllEntities.data?.data.data &&
        customComponent &&
        customComponent(getAllEntities.data?.data.data, value)}
    </div>
  );
}

const EntityCombobox: React.FC<EntityComboboxProps> = (props) => {
  if (props.fetchOptions) {
    return <EntityComboboxFetchMode {...props} />;
  }
  return <EntityComboboxEntityMode {...props} />;
};

export default EntityCombobox;
