"use client";
// Dense-grid exception: course-specific rates use a wide inline editor grid (R5 PageContainer width="wide" at route).

import { Button, Checkbox, Input, Switch, buttonVariants, inputClassName, useToast } from "@/components/primitives";

import { fetchEntities, fetchEntity, updateEntity } from "@/app/client-api/utils";
import EntityCombobox from "@/components/form/entity-combobox";
import { Loader } from "@/components/form/loader";
import { queryParamDefault } from "@/config/defaults";
import { listToApiArray } from "@/helpers/filter-params";
import { operatorEnum } from "@/types/api";
import { categoryType } from "@/types/course";
import { role } from "@/types/user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";

type CourseRates = Record<string, string | number>;

const USER_FILTER = {
  filter_params: [
    {
      field_name: "roles",
      operator: operatorEnum.contained_by,
      value: listToApiArray([role.admin, role.manager, role.teacher]),
    },
  ],
};

const hasChanges = (local: CourseRates, server: CourseRates) => {
  const cleaned = Object.fromEntries(
    Object.entries(local).filter(([, v]) => v !== "")
  );
  const serverKeys = new Set(Object.keys(server));
  const localKeys = new Set(Object.keys(cleaned));
  if (serverKeys.size !== localKeys.size) return true;
  for (const k of Array.from(localKeys)) {
    if (String(cleaned[k]) !== String(server[k] ?? "")) return true;
  }
  return false;
};

const CourseRatesEditor = () => {
  const [userId, setUserId] = useQueryState(
    "userId",
    parseAsString.withDefault("")
  );
  const [localRates, setLocalRates] = useState<CourseRates>({});
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkRate, setBulkRate] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(
    () => new Set()
  );
  const [includeInactiveUsers, setIncludeInactiveUsers] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey: ["getAllCategories"],
    queryFn: () =>
      fetchEntities("categories", {
        size: -1,
        fields: ["id", "name"],
        sorts: ["name"],
      }),
  });

  const userQuery = useQuery({
    queryKey: ["getUser", userId],
    queryFn: () => fetchEntity("users", userId, []),
    enabled: !!userId,
  });

  const courseRates: CourseRates = userQuery.data?.data?.data?.course_rates ?? {};

  useEffect(() => {
    setLocalRates(courseRates);
  }, [userId, userQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async (rates: CourseRates) =>
      updateEntity("users", userId, { course_rates: rates }),
    onSuccess: () => {
      toast.add({ title: "Course rates updated" });
      queryClient.invalidateQueries({ queryKey: ["getUser", userId] });
    },
    onError: () => {
      toast.add({ title: "Failed to update", type: "error" });
    },
  });

  const handleRateChange = (categoryId: number, value: string) => {
    setLocalRates((prev) => ({ ...prev, [String(categoryId)]: value }));
  };

  const handleSave = () => {
    const cleaned = Object.fromEntries(
      Object.entries(localRates).filter(([, v]) => v !== "")
    );
    updateMutation.mutate(cleaned);
  };

  const categories = (categoriesQuery.data?.data?.data ?? []) as categoryType[];

  const prevBulkMode = useRef(false);
  useEffect(() => {
    if (isBulkMode && !prevBulkMode.current && categories.length > 0) {
      setSelectedCategoryIds(new Set(categories.map((c) => c.id)));
    }
    prevBulkMode.current = isBulkMode;
    if (!isBulkMode) setSelectedCategoryIds(new Set());
  }, [isBulkMode, categories]);

  const toggleCategory = (id: number) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected =
    categories.length > 0 &&
    selectedCategoryIds.size === categories.length;
  const someSelected = selectedCategoryIds.size > 0;
  const selectAllChecked = allSelected;
  const selectAllIndeterminate = someSelected && !allSelected;

  const handleSelectAll = (checked: boolean) => {
    setSelectedCategoryIds(
      checked
        ? new Set(categories.map((c) => c.id))
        : new Set()
    );
  };

  const handleApplyToAll = () => {
    const next = { ...localRates };
    selectedCategoryIds.forEach((id) => {
      next[String(id)] = bulkRate;
    });
    const cleaned = Object.fromEntries(
      Object.entries(next).filter(([, v]) => v !== "")
    );
    setLocalRates(cleaned);
    updateMutation.mutate(cleaned, {
      onSuccess: () => {
        setIsBulkMode(false);
        setBulkRate("");
      },
    });
  };
  const dirty = useMemo(
    () => hasChanges(localRates, courseRates),
    [localRates, courseRates]
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const isSaving = updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div>
        <div>
          <h3 className="text-xl">Course-Specific Rates</h3>
          <p className="max-w-[65ch] leading-relaxed">
            Set hourly rates per category for this user. When assigned to a
            course, the rate for that course&apos;s category will apply.
          </p>
          {userId &&
            !userQuery.isLoading &&
            !isBulkMode &&
            categories.length > 0 && (
              <div>
                <Button
                  variant="secondary" onClick={() => setIsBulkMode(true)}
                >
                  Bulk update
                </Button>
              </div>
            )}
        </div>
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-4">
            <EntityCombobox
              entity="users"
              value={userId || undefined}
              onChange={setUserId}
              label="User"
              displayFunction={(u) => `${u.name} (${u.email})`}
              queryParams={{
                ...queryParamDefault,
                fields: ["id", "name", "email"],
                sorts: ["name"],
                ...(includeInactiveUsers ? { include_inactive: true } : {}),
              }}
              filterParams={USER_FILTER}
            />
            <div className="flex items-center space-x-2 pb-2">
              <Switch
                id="course-rates-include-inactive"
                checked={includeInactiveUsers}
                onCheckedChange={setIncludeInactiveUsers}
              />
              <label
                htmlFor="course-rates-include-inactive"
                className="text-sm font-normal whitespace-nowrap"
              >
                Include inactive
              </label>
            </div>
          </div>

          {!userId ? (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[65ch]">
              Select a user to view and edit their category rates.
            </p>
          ) : userQuery.isLoading ? (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground leading-relaxed"
              role="status"
              aria-live="polite"
            >
              <span aria-hidden>
                <Loader />
              </span>
              Loading rates…
            </div>
          ) : isBulkMode ? (
            <fieldset
              disabled={isSaving}
              className="min-w-0 space-y-4 border-0 p-0 m-0"
              aria-busy={isSaving || undefined}
            >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Rate to apply…"
                  value={bulkRate}
                  onChange={(e) => setBulkRate(e.target.value)}
                  className="w-40 font-mono tabular-nums"
                  aria-label="Rate to apply to selected categories"
                />
                <Button
                  onClick={handleApplyToAll}
                  disabled={
                    selectedCategoryIds.size === 0 || bulkRate.trim() === ""
                  }
                  isLoading={updateMutation.isPending}
                >
                  Apply to all
                </Button>
                <Button
                  variant="secondary" onClick={() => {
                    setIsBulkMode(false);
                    setBulkRate("");
                  }}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
              <div className="flex items-center gap-3 py-2 border-b border-border">
                <Checkbox
                  id="bulk-select-all"
                  checked={selectAllChecked}
                  indeterminate={selectAllIndeterminate}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all categories"
                />
                <label
                  htmlFor="bulk-select-all"
                  className="text-sm font-semibold cursor-pointer"
                >
                  Select all
                </label>
              </div>
              <ul className="space-y-2">
                {categories.map((cat) => (
                  <li
                    key={cat.id}
                    className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                  >
                    <Checkbox
                      id={`bulk-cat-${cat.id}`}
                      checked={selectedCategoryIds.has(cat.id)}
                      onCheckedChange={() => toggleCategory(cat.id)}
                      aria-label={`Select ${cat.name}`}
                    />
                    <label
                      htmlFor={`bulk-cat-${cat.id}`}
                      className="text-sm font-medium cursor-pointer flex-1"
                    >
                      {cat.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            </fieldset>
          ) : (
            <fieldset
              disabled={isSaving}
              className="min-w-0 space-y-6 border-0 p-0 m-0"
              aria-busy={isSaving || undefined}
            >
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold mb-3 text-foreground">
                  Category Rates
                </h2>
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-[65ch]">
                    No categories defined. Create categories first to set rates.
                  </p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th className="font-semibold">Category</th>
                        <th className="w-[160px] font-semibold">
                          Hourly Rate
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat) => {
                        const key = String(cat.id);
                        const rate = localRates[key] ?? courseRates[key] ?? "";
                        return (
                          <tr key={cat.id}>
                            <td className="font-medium min-w-0 max-w-[240px]">
                              <span className="truncate block" title={cat.name}>
                                {cat.name}
                              </span>
                            </td>
                            <td className="tabular-nums">
                              <Input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                spellCheck={false}
                                placeholder="e.g. 1500…"
                                value={rate != null ? String(rate) : ""}
                                onChange={(e) =>
                                  handleRateChange(cat.id, e.target.value)
                                }
                                aria-label={`Hourly rate for ${cat.name}`}
                                className="w-full font-mono tabular-nums"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {categories.length > 0 && (
                <Button
                  onClick={handleSave}
                  disabled={!dirty}
                  isLoading={updateMutation.isPending}
                >
                  Save changes
                </Button>
              )}
            </div>
            </fieldset>
          )}
        </div>
      </div>
    </div>
  );
};

export default CourseRatesEditor;
