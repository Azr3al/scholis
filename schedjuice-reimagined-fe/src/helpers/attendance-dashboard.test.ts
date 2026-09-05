import { describe, expect, it } from "vitest";
import {
  buildCourseMonthOptions,
  buildCourseYearOptions,
  derivePerfectAttendanceStudents,
  filterSummaryStudentsBySearch,
  isViewingCurrentCalendarMonth,
  normalizeSessionHeaderDate,
  parseMonthAnchor,
  parseMonthlyAttendanceResponse,
  pickClassAggregateForMonth,
  resolveDefaultMonth,
  resolveHighlightSessionDate,
  resolveMonthAnchorForYearChange,
} from "@/helpers/attendance-dashboard";
import type { CourseAttendanceSummary } from "@/types/attendance";

describe("resolveDefaultMonth", () => {
  const course = (start: string | null, end: string | null) =>
    ({ start_date: start, end_date: end }) as {
      start_date: string | null;
      end_date: string | null;
    };

  it("returns current month when today is within course range", () => {
    const today = new Date(2026, 3, 10);
    expect(
      resolveDefaultMonth(course("2026-01-01", "2026-12-31"), today),
    ).toBe("2026-04-01");
  });

  it("returns course start month when today is before course", () => {
    const today = new Date(2026, 0, 5);
    expect(
      resolveDefaultMonth(course("2026-03-01", "2026-12-31"), today),
    ).toBe("2026-03-01");
  });

  it("returns course end month when today is after course", () => {
    const today = new Date(2027, 0, 5);
    expect(
      resolveDefaultMonth(course("2026-01-01", "2026-06-30"), today),
    ).toBe("2026-06-01");
  });

  it("returns current month when course dates missing", () => {
    const today = new Date(2026, 3, 10);
    expect(resolveDefaultMonth(course(null, null), today)).toBe("2026-04-01");
  });
});

describe("resolveHighlightSessionDate", () => {
  const headers = ["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-06"];

  it("returns today when it is a session day", () => {
    expect(resolveHighlightSessionDate(headers, "2026-04-03")).toBe("2026-04-03");
  });

  it("returns closest past session when today is not a session day", () => {
    expect(resolveHighlightSessionDate(headers, "2026-04-05")).toBe("2026-04-03");
  });

  it("returns null when today is before first session in month", () => {
    expect(resolveHighlightSessionDate(headers, "2026-04-01")).toBe("2026-04-01");
    expect(resolveHighlightSessionDate(headers, "2026-03-31")).toBeNull();
  });

  it("returns null for empty headers", () => {
    expect(resolveHighlightSessionDate([], "2026-04-03")).toBeNull();
  });
});

describe("isViewingCurrentCalendarMonth", () => {
  it("returns false for all", () => {
    expect(isViewingCurrentCalendarMonth("all", new Date(2026, 3, 10))).toBe(
      false,
    );
  });

  it("returns true when dateRange matches today month", () => {
    expect(isViewingCurrentCalendarMonth("2026-04-01", new Date(2026, 3, 10))).toBe(
      true,
    );
  });

  it("returns false for other months", () => {
    expect(isViewingCurrentCalendarMonth("2026-03-01", new Date(2026, 3, 10))).toBe(
      false,
    );
  });
});

describe("parseMonthAnchor", () => {
  it("parses YYYY-MM-01 anchors", () => {
    expect(parseMonthAnchor("2026-06-01")).toEqual({ year: 2026, monthIndex: 5 });
  });

  it("returns null for all", () => {
    expect(parseMonthAnchor("all")).toBeNull();
  });

  it("returns null for invalid values", () => {
    expect(parseMonthAnchor("invalid")).toBeNull();
    expect(parseMonthAnchor("2026-13-01")).toBeNull();
  });
});

describe("buildCourseYearOptions", () => {
  it("returns unique years sorted ascending", () => {
    const months = buildCourseMonthOptions("2025-09-01", "2026-02-28");
    expect(buildCourseYearOptions(months)).toEqual([
      { value: "2025", label: "2025" },
      { value: "2026", label: "2026" },
    ]);
  });
});

describe("resolveMonthAnchorForYearChange", () => {
  const months = buildCourseMonthOptions("2025-09-01", "2026-06-30");

  it("keeps all when current is all", () => {
    expect(resolveMonthAnchorForYearChange("all", "2026", months)).toBe("all");
  });

  it("keeps same month index when available in new year", () => {
    expect(resolveMonthAnchorForYearChange("2025-06-01", "2026", months)).toBe(
      "2026-06-01",
    );
  });

  it("falls back to first month in year when month unavailable", () => {
    expect(resolveMonthAnchorForYearChange("2026-06-01", "2025", months)).toBe(
      "2025-09-01",
    );
  });
});

describe("buildCourseMonthOptions", () => {
  it("lists months from start to end inclusive", () => {
    const options = buildCourseMonthOptions("2026-01-15", "2026-03-10");
    expect(options.map((o) => o.value)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    expect(options[0]?.label).toMatch(/January/i);
  });
});

describe("normalizeSessionHeaderDate", () => {
  it("normalizes ISO datetime to YMD", () => {
    expect(normalizeSessionHeaderDate("2026-04-03T00:00:00Z")).toBe("2026-04-03");
  });
});

describe("pickClassAggregateForMonth", () => {
  const summary: CourseAttendanceSummary = {
    months: [{ anchor: "2026-04-01", label: "April 2026", session_count: 2 }],
    students: [],
    class_aggregate: {
      by_month: {
        "2026-04-01": { attended: 3, total: 4, pct: 75 },
      },
      course: { attended: 3, total: 4, pct: 75 },
    },
  };

  it("returns null for all or missing anchor", () => {
    expect(pickClassAggregateForMonth(summary, "all")).toBeNull();
    expect(pickClassAggregateForMonth(summary, null)).toBeNull();
    expect(pickClassAggregateForMonth(summary, "2026-05-01")).toBeNull();
  });
});

describe("filterSummaryStudentsBySearch", () => {
  const students = [
    {
      id: 1,
      name: "Alice Smith",
      is_removed: false,
      by_month: {},
      course: { attended: 0, total: 0, pct: 0 },
    },
    {
      id: 2,
      name: "Bob Jones",
      is_removed: false,
      by_month: {},
      course: { attended: 0, total: 0, pct: 0 },
    },
  ];

  it("returns all students when search is empty", () => {
    expect(filterSummaryStudentsBySearch(students, "")).toHaveLength(2);
  });

  it("filters by name case-insensitively", () => {
    expect(filterSummaryStudentsBySearch(students, "alice")).toHaveLength(1);
    expect(filterSummaryStudentsBySearch(students, "alice")[0]?.name).toBe(
      "Alice Smith",
    );
  });
});

describe("parseMonthlyAttendanceResponse", () => {
  it("returns empty matrix and students for an empty body", () => {
    expect(parseMonthlyAttendanceResponse({ data: {} })).toEqual({
      matrix: [],
      students: [],
    });
  });

  it("defaults students to empty when omitted", () => {
    const matrix = [["Student Name", "Total Attendance", "Attendance Percentage"]];

    expect(parseMonthlyAttendanceResponse({ data: matrix })).toEqual({
      matrix,
      students: [],
    });
  });
});

describe("derivePerfectAttendanceStudents", () => {
  const header = [
    "Student Name",
    "Total Attendance",
    "Attendance Percentage",
    "2026-07-01",
    "2026-07-03",
  ];

  const students = [
    { id: 1, name: "Ko Ko", is_removed: false },
    { id: 2, name: "Aye Chan", is_removed: false },
    { id: 3, name: "Hnin Wai", is_removed: true },
  ];

  it("returns active students who are present on every session, sorted by name", () => {
    const matrix = [
      header,
      ["Ko Ko", "2", "100", "present", "present"],
      ["Aye Chan", "2", "100", "present", "present"],
      ["Hnin Wai", "2", "100", "present", "present"],
    ];
    expect(derivePerfectAttendanceStudents(matrix, students)).toEqual([
      { id: 2, name: "Aye Chan" },
      { id: 1, name: "Ko Ko" },
    ]);
  });

  it("excludes late, absent, and unregistered", () => {
    const matrix = [
      header,
      ["Ko Ko", "1", "50", "present", "late"],
      ["Aye Chan", "1", "50", "present", "absent"],
      ["Hnin Wai", "0", "0", "unregistered", "unregistered"],
    ];
    expect(
      derivePerfectAttendanceStudents(matrix, [
        { id: 1, name: "Ko Ko", is_removed: false },
        { id: 2, name: "Aye Chan", is_removed: false },
        { id: 3, name: "Hnin Wai", is_removed: false },
      ]),
    ).toEqual([]);
  });

  it("excludes removed students even when all present", () => {
    const matrix = [
      header,
      ["Hnin Wai", "2", "100", "present", "present"],
    ];
    expect(
      derivePerfectAttendanceStudents(matrix, [
        { id: 3, name: "Hnin Wai", is_removed: true },
      ]),
    ).toEqual([]);
  });

  it("excludes rows with zero session columns", () => {
    const shortHeader = [
      "Student Name",
      "Total Attendance",
      "Attendance Percentage",
    ];
    const matrix = [shortHeader, ["Ko Ko", "0", "0"]];
    expect(
      derivePerfectAttendanceStudents(matrix, [
        { id: 1, name: "Ko Ko", is_removed: false },
      ]),
    ).toEqual([]);
  });

  it("returns [] for empty or header-only matrix", () => {
    expect(derivePerfectAttendanceStudents([], students)).toEqual([]);
    expect(derivePerfectAttendanceStudents([header], students)).toEqual([]);
  });

  it("skips body rows when students meta is missing for that index", () => {
    const matrix = [
      header,
      ["Ko Ko", "2", "100", "present", "present"],
    ];
    expect(derivePerfectAttendanceStudents(matrix, [])).toEqual([]);
  });

  describe("month-to-date (asOfYmd)", () => {
    const mtdHeader = [
      "Student Name",
      "Total Attendance",
      "Attendance Percentage",
      "2026-07-07",
      "2026-07-08",
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
    ];

    const mtdStudents = [
      { id: 1, name: "Aye Pwint", is_removed: false },
      { id: 2, name: "Aung Bhone", is_removed: false },
      { id: 3, name: "Hein Htet", is_removed: false },
    ];

    it("includes students present through asOfYmd when future sessions are unregistered", () => {
      const matrix = [
        mtdHeader,
        [
          "Aye Pwint",
          "3",
          "100",
          "present",
          "present",
          "present",
          "unregistered",
          "unregistered",
        ],
        [
          "Aung Bhone",
          "2",
          "67",
          "present",
          "present",
          "absent",
          "unregistered",
          "unregistered",
        ],
        [
          "Hein Htet",
          "3",
          "100",
          "present",
          "present",
          "present",
          "unregistered",
          "unregistered",
        ],
      ];
      expect(
        derivePerfectAttendanceStudents(matrix, mtdStudents, "2026-07-13"),
      ).toEqual([
        { id: 1, name: "Aye Pwint" },
        { id: 3, name: "Hein Htet" },
      ]);
    });

    it("excludes students with late or absent on a session on or before asOfYmd", () => {
      const matrix = [
        mtdHeader,
        [
          "Aye Pwint",
          "2",
          "67",
          "present",
          "late",
          "present",
          "unregistered",
          "unregistered",
        ],
        [
          "Aung Bhone",
          "2",
          "67",
          "present",
          "present",
          "absent",
          "unregistered",
          "unregistered",
        ],
      ];
      expect(
        derivePerfectAttendanceStudents(
          matrix,
          [
            { id: 1, name: "Aye Pwint", is_removed: false },
            { id: 2, name: "Aung Bhone", is_removed: false },
          ],
          "2026-07-13",
        ),
      ).toEqual([]);
    });

    it("excludes students when all sessions are after asOfYmd", () => {
      const matrix = [
        mtdHeader,
        [
          "Aye Pwint",
          "0",
          "0",
          "unregistered",
          "unregistered",
          "unregistered",
          "unregistered",
          "unregistered",
        ],
      ];
      expect(
        derivePerfectAttendanceStudents(
          matrix,
          [{ id: 1, name: "Aye Pwint", is_removed: false }],
          "2026-07-06",
        ),
      ).toEqual([]);
    });

    it("without asOfYmd still requires all sessions including future unregistered", () => {
      const matrix = [
        mtdHeader,
        [
          "Aye Pwint",
          "3",
          "100",
          "present",
          "present",
          "present",
          "unregistered",
          "unregistered",
        ],
      ];
      expect(
        derivePerfectAttendanceStudents(matrix, [
          { id: 1, name: "Aye Pwint", is_removed: false },
        ]),
      ).toEqual([]);
    });
  });
});
