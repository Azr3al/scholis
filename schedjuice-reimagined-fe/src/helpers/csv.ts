import { parse } from "csv-parse/sync";
import * as zod from "zod";
import { getPropertyPaths } from "./getPropertyPaths";

export const parseCsvWithSchema = <T>(
  csvFile: File,
  zodSchema: zod.ZodType,
  onLoadEndCallback: (result: T[]) => void,
  onFormatErrorCallback: (message: string) => void,
  toJson = true
): void => {
  const reader = new FileReader();
  reader.readAsText(csvFile);
  reader.onerror = () => {
    onFormatErrorCallback("Error reading CSV file");
  };

  reader.onloadend = () => {
    const firstLine = (reader.result as string).split("\n")[0];
    if (!firstLine) {
      onFormatErrorCallback("CSV file is empty");
      return;
    }
    const expectedHeaders = getPropertyPaths(zodSchema);
    let temp = getPropertyPaths(zodSchema, true);
    let optionalHeaders = getPropertyPaths(zodSchema).filter(
      (header) => !temp.includes(header)
    );

    const result = parse(reader.result as string, { columns: toJson });
    if (result.length === 0) {
      onLoadEndCallback(result);
      return;
    }
    const headers = Object.keys(result[0]);
    const headerDiff = getHeaderDiff(headers, expectedHeaders, optionalHeaders);
    if (
      headerDiff.extraHeaders.length > 0 &&
      headerDiff.missingHeaders.length > 0
    ) {
      onFormatErrorCallback(
        `Extra headers found in CSV: ${headerDiff.extraHeaders.join(
          ", "
        )} and missing headers in CSV: ${headerDiff.missingHeaders.join(", ")}`
      );
      return;
    }
    if (headerDiff.extraHeaders.length > 0) {
      onFormatErrorCallback(
        `Extra headers found in CSV: ${headerDiff.extraHeaders.join(", ")}`
      );
      return;
    }
    if (headerDiff.missingHeaders.length > 0) {
      onFormatErrorCallback(
        `Missing headers in CSV: ${headerDiff.missingHeaders.join(", ")}`
      );
      return;
    }
    onLoadEndCallback(result);
  };
};

export const getHeaderDiff = (
  actualHeaders: string[],
  expectedHeaders: string[],
  optionalHeaders: string[] = []
) => {
  const missingHeaders = expectedHeaders.filter(
    (header) =>
      !actualHeaders.includes(header) && !optionalHeaders.includes(header)
  );
  const extraHeaders = actualHeaders.filter(
    (header) =>
      !expectedHeaders.includes(header) && !optionalHeaders.includes(header)
  );
  return { missingHeaders, extraHeaders };
};

export const parseCsv = (
  csvFile: File,
  onLoadEndCallback: (result: Record<string, string>[]) => void,
  onFormatErrorCallback: (message: string) => void,
  toJson = true
): void => {
  const reader = new FileReader();
  reader.readAsText(csvFile);
  reader.onerror = () => {
    onFormatErrorCallback("Error reading CSV file");
  };

  reader.onloadend = () => {
    const firstLine = (reader.result as string).split("\n")[0];
    if (!firstLine) {
      onFormatErrorCallback("CSV file is empty");
      return;
    }

    const result = parse(reader.result as string, { columns: toJson });

    onLoadEndCallback(result);
  };
};
