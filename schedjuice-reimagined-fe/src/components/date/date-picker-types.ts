import type { ControlSize } from "@/lib/ui/control-sizing";

export type DatePickerVariant = "popover" | "native";

export type SharedDatePickerProps = {
  date?: Date;
  setDate: (date?: Date) => void;
  disabled?: boolean;
  fromDate?: Date | string;
  toDate?: Date | string;
  defaultMonth?: Date | string;
  size?: ControlSize;
};

export type PopoverDatePickerProps = SharedDatePickerProps & {
  variant?: "popover";
  showTriggerIcon?: boolean;
  popoverAlign?: "start" | "center" | "end";
  popoverSide?: "top" | "bottom" | "left" | "right";
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "onChange" | "type"
>;

/** Props for the native `<input type="date">` implementation (no variant field). */
export type NativeDatePickerInputProps = SharedDatePickerProps &
  Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "size"
  >;

export type NativeDatePickerProps = NativeDatePickerInputProps & {
  variant: "native";
};

export type DatePickerProps = PopoverDatePickerProps | NativeDatePickerProps;
