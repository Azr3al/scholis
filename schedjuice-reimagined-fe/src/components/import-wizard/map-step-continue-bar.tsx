"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { memo, useMemo } from "react";

import type { ImportFieldDef } from "@/app/client-api/imports";
import useImportStore from "@/store/import-store";
import { useHubPrograms } from "@/hooks/academic-hub/use-programs";
import {
  emailMappedColumn,
  coursesMappedColumn,
  getUnmappedRequiredFields,
} from "@/lib/imports/wizard-logic";
import {
  computeHeaderSignature,
  saveRememberedImport,
} from "@/lib/imports/remembered-imports";
import {
  isScopeComplete,
  scopeIncompleteMessage,
} from "@/lib/imports/course-scope";

type MapStepContinueBarProps = {
  fields: ImportFieldDef[];
};

export const MapStepContinueBar = memo(function MapStepContinueBar({
  fields,
}: MapStepContinueBarProps) {
  const mapping = useImportStore((s) => s.mapping);
  const fieldDefaults = useImportStore((s) => s.fieldDefaults);
  const matchConfig = useImportStore((s) => s.matchConfig);
  const matchPriority = useImportStore((s) => s.matchPriority);
  const parse = useImportStore((s) => s.parse);
  const role = useImportStore((s) => s.role);
  const courseScope = useImportStore((s) => s.courseScope);
  const setStep = useImportStore((s) => s.setStep);
  const { data: programs } = useHubPrograms();

  const { canContinue, helperText } = useMemo(() => {
    const requiredMissing = getUnmappedRequiredFields(
      fields,
      mapping,
      fieldDefaults,
    );
    const emailMapped = emailMappedColumn(mapping) !== null;
    const coursesMapped = coursesMappedColumn(mapping) !== null;
    const selectedProgram =
      programs?.find((p) => p.id === courseScope.programId) ?? null;
    const scopeMessage = coursesMapped
      ? scopeIncompleteMessage(courseScope, selectedProgram)
      : null;
    const scopeOk =
      !coursesMapped || isScopeComplete(courseScope, selectedProgram);

    if (!emailMapped) {
      return {
        canContinue: false,
        helperText: "Map an Email column to continue.",
      };
    }
    if (requiredMissing.length > 0) {
      return {
        canContinue: false,
        helperText: `Resolve ${requiredMissing.length} required field${
          requiredMissing.length === 1 ? "" : "s"
        } to continue.`,
      };
    }
    if (!scopeOk && scopeMessage) {
      return { canContinue: false, helperText: scopeMessage };
    }
    return { canContinue: true, helperText: null };
  }, [fields, mapping, fieldDefaults, courseScope, programs]);

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        disabled={!canContinue}
        onClick={() => {
          if (parse) {
            saveRememberedImport({
              signature: computeHeaderSignature(parse.headers),
              role,
              mapping,
              fieldDefaults,
              matchConfig,
              matchPriority,
            });
          }
          setStep("review");
        }}
      >
        Continue to review
      </Button>
      {helperText ? (
        <span className="text-sm text-muted-foreground">{helperText}</span>
      ) : null}
    </div>
  );
});
