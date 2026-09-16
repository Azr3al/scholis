import { format } from "date-fns";
import Selector from "./selector";
import { type MonthType, MONTH_TYPE_HM } from "@/helpers/date";

const MONTH_OPTIONS_FM = Array.from({ length: 12 }, (_, i) => ({
  label: format(new Date(2000, i, 1), "MMMM"),
  value: `${i}`,
}));

const MONTH_OPTIONS_HM = Array.from({ length: 12 }, (_, i) => ({
  label: `${format(new Date(2000, i, 1), "MMM")} - ${format(new Date(2000, (i + 1) % 12, 1), "MMM")}`,
  value: `${i}`,
}));

/** Pure helper for month dropdown labels (FM full names vs HM ranges). */
export const getMonthSelectorOptions = (monthType?: MonthType | null) =>
  monthType === MONTH_TYPE_HM ? MONTH_OPTIONS_HM : MONTH_OPTIONS_FM;

interface MonthSelectorProps {
  date?: Date;
  setDate: (date: Date) => void;
  label?: string;
  isRequired?: boolean;
  monthType?: MonthType | null;
  fullWidth?: boolean;
}

const MonthSelector: React.FC<MonthSelectorProps> = ({
  date,
  setDate,
  label,
  isRequired,
  monthType,
  fullWidth = false,
}) => {
  const select = (
    <Selector
      className={
        fullWidth
          ? undefined
          : monthType === MONTH_TYPE_HM
            ? "h-10 w-36 min-w-0"
            : "h-10 w-32 min-w-0"
      }
      fullWidth={fullWidth}
      options={getMonthSelectorOptions(monthType)}
      value={date?.getMonth().toString()}
      onChange={(value) => {
        if (!date) return;
        setDate(new Date(date.getFullYear(), parseInt(value), 1));
      }}
    />
  );

  if (!label && !fullWidth) {
    return select;
  }

  return (
    <div className={fullWidth ? "min-w-0 w-full" : undefined}>
      {label ? (
        <p className="space-x-1 text-sm">
          <span>{label}</span>
          {isRequired ? <span className="text-red-500">*</span> : null}
        </p>
      ) : null}
      {select}
    </div>
  );
};

export default MonthSelector;
