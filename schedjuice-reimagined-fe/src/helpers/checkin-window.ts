import { formatInTimeZone } from "date-fns-tz";
import {
  orgTimeDateFnsPattern,
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";

export function formatCheckinOpensAt(
  isoUtc: string,
  timezone: string | undefined,
  format: TimeDisplayFormatValue = "12h",
): string {
  const tz = timezone || "UTC";
  return formatInTimeZone(
    new Date(isoUtc),
    tz,
    orgTimeDateFnsPattern(resolveTimeDisplayFormat(format)),
  );
}
