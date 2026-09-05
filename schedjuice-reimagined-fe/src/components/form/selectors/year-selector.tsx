import Selector from "./selector";

export const DEFAULT_YEARS_BACK = 20;

/** Exam sessions are often scheduled 1–2 years ahead of the current year. */
export const EXAM_SESSION_YEARS_AHEAD = 2;

export function buildYearOptions(
  yearsAhead = 0,
  yearsBack = DEFAULT_YEARS_BACK,
): { label: string; value: string }[] {
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + yearsAhead;
  const minYear = currentYear - yearsBack + 1;
  const count = maxYear - minYear + 1;
  return Array.from({ length: count }, (_, i) => ({
    label: `${maxYear - i}`,
    value: `${maxYear - i}`,
  }));
}

const DEFAULT_YEAR_OPTIONS = buildYearOptions();

interface YearSelectorProps {
  date?: Date;
  setDate: (date: Date) => void;
  label?: string;
  fullWidth?: boolean;
  /** Include years after the current calendar year (e.g. exam session dates). */
  yearsAhead?: number;
}

const YearSelector: React.FC<YearSelectorProps> = ({
  date,
  setDate,
  label,
  fullWidth = false,
  yearsAhead = 0,
}) => {
  const options =
    yearsAhead > 0 ? buildYearOptions(yearsAhead) : DEFAULT_YEAR_OPTIONS;

  return (
    <Selector
      label={label}
      options={options}
      value={date?.getFullYear().toString()}
      onChange={(value) => setDate(new Date(value))}
      fullWidth={fullWidth}
      className={fullWidth ? undefined : "h-10 w-28 min-w-0"}
    />
  );
};

export default YearSelector;
