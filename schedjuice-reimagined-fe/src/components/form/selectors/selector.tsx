import { Select } from "@/components/primitives";
import { RequiredMark } from "@/components/form/required-mark";
import {
  filterToolbarFieldStackClassName,
  filterToolbarLabelClassName,
  type FilterFieldLayout,
} from "@/components/filters/filter-toolbar";
import { controlSizeClassName } from "@/lib/ui/control-sizing";
import { cn } from "@/lib/utils";

import { Loader } from "../loader";

interface SelectorProps {
  options: { label?: string; value: string; item?: any }[];
  value: string | undefined;
  onChange: (value: string) => void;
  label?: string;
  renderOption?: (
    option: { label?: string; value: string; item?: any },
    index: number,
  ) => React.ReactNode;
  isLoading?: boolean;
  containerClassName?: string;
  twoCols?: boolean;
  isRequired?: boolean;
  className?: string;
  showOnlyInlineLable?: boolean;
  isDisabled?: boolean;
  /** Use full cell width (e.g. table cells) instead of fixed 180px trigger. */
  fullWidth?: boolean;
  layout?: FilterFieldLayout;
}

// just a boilerplate select component because the original one is too long to write
const Selector: React.FC<SelectorProps> = ({
  options,
  value,
  onChange,
  label,
  renderOption,
  isLoading,
  containerClassName,
  isRequired = false,
  className,
  showOnlyInlineLable = false,
  isDisabled = false,
  fullWidth = false,
  layout = "form",
}) => {
  const isToolbar = layout === "toolbar";
  const items = (options ?? []).map((option, i) => ({
    value: option.value,
    label: renderOption
      ? renderOption(option, i)
      : (option.label ?? option.value),
  }));

  return (
    <>
      <div
        className={cn(
          label && !showOnlyInlineLable
            ? isToolbar
              ? filterToolbarFieldStackClassName()
              : "space-y-2"
            : "inline-flex h-10 max-w-full items-stretch",
          fullWidth && "min-w-0 w-full max-w-full",
          containerClassName,
        )}
      >
        {label && !showOnlyInlineLable && (
          <label className={cn("space-x-1", isToolbar && filterToolbarLabelClassName())}>
            <span>{label}</span>
            {isRequired ? <RequiredMark /> : null}
          </label>
        )}
        {isLoading ? (
          <div
            className={cn(
              "flex items-center rounded-md border border-border px-3",
              controlSizeClassName(fullWidth ? "full" : "default"),
              className,
            )}
          >
            <Loader />
          </div>
        ) : (
          <Select
            value={value || undefined}
            onValueChange={(v) => onChange(String(v ?? ""))}
            disabled={isDisabled}
            size={fullWidth ? "full" : "default"}
            className={className}
            placeholder={label}
            items={items}
          />
        )}
      </div>
    </>
  );
};

export default Selector;
