"use client";

import { CourseCategoryField } from "@/components/course/course-category-field";
import { CourseSubjectField } from "@/components/course/course-subject-field";
import EntityCombobox from "@/components/form/entity-combobox";
import type { AutoFormInputComponentProps } from "@/components/auto-form";
import { Field, Input } from "@/components/primitives";
import { operatorEnum } from "@/types/api";
import { programType } from "@/types/program";
import {
  isCourseProgramFieldRequired,
  shouldShowCourseProgramField,
} from "@/helpers/course-program-validation";
import { UseFormReturn } from "react-hook-form";

export type BuildCourseProgramFieldConfigOptions = {
  form: UseFormReturn<any>;
  selectedProgram: programType | undefined;
  mode: "create" | "edit";
  programReadOnly?: boolean;
};

export function buildCourseProgramFieldConfig({
  form,
  selectedProgram,
  mode,
  programReadOnly = false,
}: BuildCourseProgramFieldConfigOptions) {
  const showProgramReadOnly =
    programReadOnly || (mode === "edit" && !!selectedProgram);

  return {
    program: {
      fieldType: ({
        field,
        fieldConfigItem,
        label,
      }: AutoFormInputComponentProps) => {
        if (showProgramReadOnly && selectedProgram) {
          return (
            <Field.Root className="w-full max-w-xl" name={field.name}>
              <Field.Label>{label}</Field.Label>
              <Input value={selectedProgram.name} disabled readOnly />
              {fieldConfigItem.description ? (
                <Field.Description>
                  {fieldConfigItem.description}
                </Field.Description>
              ) : null}
            </Field.Root>
          );
        }
        return (
          <EntityCombobox
            entity="programs"
            displayFunction={(e) => e.name}
            value={String(field.value ?? "")}
            onChange={(v) => {
              field.onChange(v ? parseInt(v, 10) : null);
              field.onBlur();
            }}
            label={label}
            formDescription={fieldConfigItem.description}
            canSetDefaultValue={false}
            comboboxPlaceholder="Select a program"
          />
        );
      },
    },
    intake: {
      fieldType: ({
        field,
        fieldConfigItem,
        label,
        isRequired,
      }: AutoFormInputComponentProps) => {
        if (!shouldShowCourseProgramField("intake", selectedProgram)) {
          return null;
        }
        const pid = form.watch("program");
        const intakeParams = pid
          ? {
              filter_params: [
                {
                  field_name: "program",
                  operator: operatorEnum.exact,
                  value: String(pid),
                },
              ],
            }
          : undefined;
        const required =
          isRequired ||
          isCourseProgramFieldRequired("intake", selectedProgram);
        return (
          <EntityCombobox
            entity="intakes"
            displayFunction={(e) => e.name}
            value={String(field.value ?? "")}
            onChange={(v) => {
              field.onChange(v ? parseInt(v, 10) : null);
              field.onBlur();
            }}
            label={required ? `${label} *` : label}
            formDescription={fieldConfigItem.description}
            filterParams={intakeParams}
          />
        );
      },
    },
    subject: {
      fieldType: ({
        field,
        fieldConfigItem,
        label,
        isRequired,
      }: AutoFormInputComponentProps) => {
        if (!shouldShowCourseProgramField("subject", selectedProgram)) {
          return null;
        }
        const required =
          isRequired ||
          isCourseProgramFieldRequired("subject", selectedProgram);
        const programId = Number(
          selectedProgram?.id ?? form.watch("program") ?? 0,
        );

        return (
          <CourseSubjectField
            programId={programId}
            subjectStrategy={selectedProgram?.subject_strategy}
            value={field.value as number | null | undefined}
            onChange={(v) => {
              field.onChange(v);
              field.onBlur();
            }}
            label={label}
            isRequired={required}
            formDescription={
              typeof fieldConfigItem.description === "string"
                ? fieldConfigItem.description
                : undefined
            }
          />
        );
      },
    },
    level: {
      fieldType: ({
        field,
        fieldConfigItem,
        label,
      }: AutoFormInputComponentProps) => {
        const pid = form.watch("program");
        if (!pid || !shouldShowCourseProgramField("level", selectedProgram)) {
          return null;
        }
        return (
          <EntityCombobox
            entity="program-levels"
            displayFunction={(e) => e.name}
            value={String(field.value ?? "")}
            onChange={(v) => {
              field.onChange(v ? parseInt(v, 10) : null);
              field.onBlur();
            }}
            label={label}
            formDescription={fieldConfigItem.description}
            filterParams={{
              filter_params: [
                {
                  field_name: "program",
                  operator: operatorEnum.exact,
                  value: String(pid),
                },
              ],
            }}
          />
        );
      },
    },
    section: {
      fieldType: ({
        field,
        fieldConfigItem,
        label,
      }: AutoFormInputComponentProps) => {
        const lid = form.watch("level");
        if (!lid || !shouldShowCourseProgramField("section", selectedProgram)) {
          return null;
        }
        return (
          <EntityCombobox
            entity="program-level-sections"
            displayFunction={(e) => e.name}
            value={String(field.value ?? "")}
            onChange={(v) => {
              field.onChange(v ? parseInt(v, 10) : null);
              field.onBlur();
            }}
            label={label}
            formDescription={fieldConfigItem.description}
            filterParams={{
              filter_params: [
                {
                  field_name: "level",
                  operator: operatorEnum.exact,
                  value: String(lid),
                },
              ],
            }}
          />
        );
      },
    },
    category: {
      fieldType: ({
        field,
        fieldConfigItem,
        label,
      }: AutoFormInputComponentProps) => (
        <CourseCategoryField
          value={
            typeof field.value === "number"
              ? field.value
              : Number(field.value) || null
          }
          onChange={(v) => {
            field.onChange(v);
            field.onBlur();
          }}
          label={label}
          formDescription={fieldConfigItem.description}
        />
      ),
    },
  };
}
