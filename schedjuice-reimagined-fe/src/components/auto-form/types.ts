import type { ReactNode } from "react";
import type { FieldMeasure } from "@/lib/ui/field-measure";
import type {
  ControllerRenderProps,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";
import type { z } from "zod";

export type ZodObjectOrWrapped =
  | z.ZodObject<any, any>
  | z.ZodEffects<z.ZodObject<any, any>>;

export type AutoFormSaveMode = "create" | "edit";

export type AutoFormGroup = {
  id: string;
  title: string;
  description?: string;
  /** Schema keys rendered in this group (order preserved). */
  fields: string[];
  /** Progressive disclosure — rare fields start collapsed. */
  collapsible?: boolean;
  /** Default measure for fields in this group when field-level measure omitted. */
  measure?: FieldMeasure;
};

export type AutoFormFieldControlKind =
  | "checkbox"
  | "date"
  | "select"
  | "radio"
  | "switch"
  | "textarea"
  | "number"
  | "fallback";

export type AutoFormInputComponentProps = {
  zodInputProps: React.InputHTMLAttributes<HTMLInputElement>;
  field: ControllerRenderProps<FieldValues, any>;
  fieldConfigItem: FieldConfigItem;
  label: string;
  isRequired: boolean;
  fieldProps: any;
  zodItem: z.ZodTypeAny;
  isLoading?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Validation message from RHF; custom fieldTypes should reserve min-h-5 for it. */
  error?: string;
};

export type FieldConfigItem = {
  description?: ReactNode;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement> & {
    defaultMonth?: Date;
    showTriggerIcon?: boolean;
    fromDate?: Date;
    toDate?: Date;
  };
  fieldType?:
    | AutoFormFieldControlKind
    | React.FC<AutoFormInputComponentProps>;
  renderParent?: (props: {
    children: React.ReactNode;
  }) => React.ReactElement | null;
  customLabel?: string;
  /** Override prettified enum option labels (value → display text). */
  enumOptionLabels?: Record<string, string>;
  /** Field container width within the form. Overrides form-level measure. */
  measure?: FieldMeasure;
  /**
   * When false, edit-mode autosave skips this field (high-risk: money, roles, etc.).
   * Prefer `shouldAutosaveField` on the form for cross-cutting policy.
   */
  autosave?: boolean;
};

export type FieldConfig<SchemaType extends z.infer<z.ZodObject<any, any>>> = {
  [Key in keyof SchemaType]?: SchemaType[Key] extends object
    ? FieldConfig<z.infer<SchemaType[Key]>> | FieldConfigItem
    : FieldConfigItem;
};

export type AutoFormProps<SchemaType extends ZodObjectOrWrapped = ZodObjectOrWrapped> = {
  schema: SchemaType;
  saveMode: AutoFormSaveMode;
  groups: AutoFormGroup[];
  fieldConfig?: Record<string, FieldConfigItem>;
  form?: UseFormReturn<any>;
  defaultValues?: Partial<z.infer<SchemaType>>;
  values?: Partial<z.infer<SchemaType>>;
  onSubmit?: (values: z.infer<SchemaType>) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  className?: string;
  /** Default field container width for all groups/fields. Default: "default". */
  measure?: FieldMeasure;
  formId?: string;
  children?: ReactNode;
  /** Edit mode: atomic field groups that must save together. */
  units?: string[][];
  /** Edit mode: gate which fields may autosave. Default: all except fieldConfig.autosave === false. */
  shouldAutosaveField?: (name: string) => boolean;
  /** Edit mode: persist partial diffs (required when saveMode=edit and autosave is active). */
  onAutosave?: (diff: Record<string, unknown>) => Promise<unknown>;
  /** TanStack query key for optimistic edit autosave. */
  autosaveQueryKey?: unknown[];
  /** Show sticky create footer (default true when saveMode=create). */
  stickyFooter?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
};

export type UseAutoFormOptions = {
  schema: ZodObjectOrWrapped;
  saveMode: AutoFormSaveMode;
  form?: UseFormReturn<any>;
  defaultValues?: Record<string, unknown>;
  values?: Record<string, unknown>;
  units?: string[][];
  shouldAutosaveField?: (name: string) => boolean;
  onAutosave?: (diff: Record<string, unknown>) => Promise<unknown>;
  autosaveQueryKey?: unknown[];
  fieldConfig?: Record<string, FieldConfigItem>;
};

export type AutoFormSkeletonProps = {
  groups: AutoFormGroup[];
  className?: string;
  /** Reserve sticky footer space to match create-mode layout. */
  saveMode?: AutoFormSaveMode;
  /**
   * When false, omit the AutoForm sticky create-footer placeholders.
   * Use for hand-composed forms (e.g. UserForm) that own a non-sticky footer.
   * Defaults to true when saveMode="create".
   */
  showCreateFooter?: boolean;
};
