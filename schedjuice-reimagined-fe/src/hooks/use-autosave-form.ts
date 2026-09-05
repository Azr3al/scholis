"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildDiffPayload,
  collectDirtyValidFields,
  deriveFormStatus,
  fieldsForFlush,
  isUnitReady,
  mergeEntityDiff,
  type FieldSaveState,
  type FormSaveStatus,
} from "@/lib/autosave/autosave-core";

export type UseAutosaveFormOptions = {
  form: UseFormReturn<any>;
  /** Persist a partial diff. Typically (diff) => updateEntity(apiUrl, id, diff). */
  save: (diff: Record<string, unknown>) => Promise<unknown>;
  /** TanStack key for optimistic write + rollback. */
  queryKey: unknown[];
  /** Atomic field groups that must save together (cross-field validation, config drivers). */
  units?: string[][];
  /**
   * Transform the changed field names + current values into the request body.
   * Default builds a flat `{ field: value }` diff. Forms with nested payloads
   * (e.g. completion's custom_data) supply their own (e.g. collectGroupPayload).
   */
  buildPayload?: (
    changedFields: string[],
    values: Record<string, unknown>,
  ) => Record<string, unknown>;
  /** Default true. Create forms pass false to no-op. */
  enabled?: boolean;
  /**
   * Validate the given field names and return the subset that is invalid.
   * Default: `form.trigger(fields)` + read `getFieldState`. Forms without a
   * resolver (e.g. UserForm's composed schema) supply their own.
   */
  validateFields?: (fields: string[]) => Promise<string[]>;
  /**
   * Gate which fields autosave. Returns false for fields owned by an explicit
   * Save button (course start/end dates, user config-section fields).
   * Default: always true.
   */
  shouldAutosaveField?: (name: string) => boolean;
};

export type UseAutosaveFormReturn = {
  status: FormSaveStatus;
  fieldStatus: Record<string, FieldSaveState>;
  retry: (field: string) => void;
  retryAll: () => void;
  bindField: (name: string) => { onBlur: () => void };
  /** Commit a field after a change event (no blur/name), e.g. role checkboxes. */
  commitField: (name: string) => void;
};

/** Flatten RHF dirtyFields into dotted-path booleans (e.g. "custom_data.foo": true). */
function flattenDirty(
  dirty: Record<string, unknown>,
  prefix = "",
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of Object.keys(dirty)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const val = dirty[k];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(out, flattenDirty(val as Record<string, unknown>, path));
    } else {
      out[path] = Boolean(val);
    }
  }
  return out;
}

export function useAutosaveForm(
  options: UseAutosaveFormOptions,
): UseAutosaveFormReturn {
  const {
    form,
    save,
    queryKey,
    units = [],
    enabled = true,
    buildPayload = (fields, values) => buildDiffPayload(values, fields),
    shouldAutosaveField = () => true,
    validateFields,
  } = options;
  const queryClient = useQueryClient();
  const [fieldStatus, setFieldStatus] = useState<Record<string, FieldSaveState>>(
    {},
  );
  const inflight = useRef<Set<string>>(new Set());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setStatus = useCallback(
    (fields: string[], state: FieldSaveState | undefined) => {
      if (!mounted.current) return;
      setFieldStatus((prev) => {
        const next = { ...prev };
        for (const f of fields) {
          if (state === undefined) delete next[f];
          else next[f] = state;
        }
        return next;
      });
    },
    [],
  );

  const flush = useCallback(
    async (fields: string[]) => {
      if (!enabled || fields.length === 0) return;
      const target = fields.filter((f) => !inflight.current.has(f));
      if (target.length === 0) return;

      const values = form.getValues();
      const payload = buildPayload(target, values);

      const prevCache = queryClient.getQueryData(queryKey);
      if (prevCache !== undefined) {
        queryClient.setQueryData(
          queryKey,
          mergeEntityDiff(
            prevCache as { data?: { data?: Record<string, unknown> } },
            payload,
          ),
        );
      }

      target.forEach((f) => inflight.current.add(f));
      setStatus(target, "saving");

      try {
        await save(payload);
        setStatus(target, "saved");
        // Clear dirty flags for saved fields (keeps typed value as the new baseline).
        target.forEach((f) =>
          form.resetField(f, { defaultValue: form.getValues(f) }),
        );
      } catch {
        // Roll back the cache; KEEP the user's typed value in form state.
        if (prevCache !== undefined) queryClient.setQueryData(queryKey, prevCache);
        setStatus(target, "error");
      } finally {
        target.forEach((f) => inflight.current.delete(f));
      }
    },
    [enabled, form, queryClient, queryKey, save, setStatus, buildPayload],
  );

  const defaultValidate = useCallback(
    async (fields: string[]) => {
      await form.trigger(fields as never);
      return fields.filter((f) => form.getFieldState(f).invalid);
    },
    [form],
  );
  const runValidate = useMemo(
    () => validateFields ?? defaultValidate,
    [validateFields, defaultValidate],
  );

  const handleBlur = useCallback(
    async (name: string) => {
      if (!enabled || !shouldAutosaveField(name)) return;
      const group = fieldsForFlush(name, units).filter(shouldAutosaveField);
      if (group.length === 0) return;
      const activeField =
        typeof document !== "undefined"
          ? (document.activeElement as HTMLElement | null)?.getAttribute("name") ??
            null
          : null;

      const invalidFields = await runValidate(group);

      // Multi-field unit: only flush once focus leaves the whole unit and all valid.
      if (group.length > 1 && !isUnitReady(group, activeField, invalidFields)) {
        return;
      }

      const dirtyFields = flattenDirty(form.formState.dirtyFields);
      const candidates = collectDirtyValidFields({ dirtyFields, invalidFields }).filter(
        shouldAutosaveField,
      );
      const groupDirtyValid = group.filter(
        (f) => dirtyFields[f] && !invalidFields.includes(f),
      );
      const toFlush = Array.from(new Set([...groupDirtyValid, ...candidates]));
      await flush(toFlush);
    },
    [enabled, flush, form, units, runValidate, shouldAutosaveField],
  );

  const bindField = useCallback(
    (name: string) => ({ onBlur: () => void handleBlur(name) }),
    [handleBlur],
  );

  const commitField = useCallback(
    (name: string) => {
      // Defer so RHF dirtyFields settles after onChange in the same event.
      queueMicrotask(() => void handleBlur(name));
    },
    [handleBlur],
  );

  const retry = useCallback(
    (field: string) => {
      void flush(fieldsForFlush(field, units));
    },
    [flush, units],
  );

  const retryAll = useCallback(() => {
    const errored = Object.keys(fieldStatus).filter(
      (f) => fieldStatus[f] === "error",
    );
    void flush(errored);
  }, [fieldStatus, flush]);

  return {
    status: deriveFormStatus(fieldStatus),
    fieldStatus,
    retry,
    retryAll,
    bindField,
    commitField,
  };
}
