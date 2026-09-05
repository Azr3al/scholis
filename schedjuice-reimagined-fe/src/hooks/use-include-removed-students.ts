"use client";

import { permissionsFor } from "@/helpers/authorization";
import { includeRemovedStudentsStorageKey } from "@/helpers/attendance-include-removed-storage";
import { useUser } from "@/hooks/useUser";
import { useCallback, useEffect, useState } from "react";

export function useIncludeRemovedStudents(courseId: string | number) {
  const { user } = useUser();
  const canToggle = permissionsFor(user ?? undefined).can(
    "attendance.view_removed_students",
  );
  const [includeRemoved, setIncludeRemovedState] = useState(false);

  useEffect(() => {
    if (!canToggle) {
      setIncludeRemovedState(false);
      return;
    }
    try {
      const raw = localStorage.getItem(includeRemovedStudentsStorageKey(courseId));
      setIncludeRemovedState(raw === "true");
    } catch {
      setIncludeRemovedState(false);
    }
  }, [canToggle, courseId]);

  const setIncludeRemoved = useCallback(
    (value: boolean) => {
      if (!canToggle) return;
      setIncludeRemovedState(value);
      try {
        localStorage.setItem(
          includeRemovedStudentsStorageKey(courseId),
          value ? "true" : "false",
        );
      } catch {
        /* ignore quota / private mode */
      }
    },
    [canToggle, courseId],
  );

  const effectiveIncludeRemoved = canToggle && includeRemoved;

  return {
    includeRemoved: effectiveIncludeRemoved,
    setIncludeRemoved,
    canToggle,
  };
}
