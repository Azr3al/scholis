export const accessLogCsvExample = {
  headers: [
    { name: "employee-no", comment: "Must match with employee account access log name" },
    { name: "date", comment: "Must be in a known format" },
    { name: "record-type", comment: "Check In/Check Out only. Ignores others." },
  ],
  csvData: [
    [
      "E001",
      "2025-26-11 08:30",
      "Check In",
    ],
    [
      "E001",
      "2025-26-11 08:45",
      "Check Out",
    ],
    [
      "E002",
      "2025-26-11 08:30",
      "Check In",
    ],
    [
      "E002",
      "2025-26-11 08:45",
      "Check Out",
    ],
  ],
};