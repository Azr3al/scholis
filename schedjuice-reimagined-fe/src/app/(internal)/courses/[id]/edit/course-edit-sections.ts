import {
  normalizeCourseFieldKeyForForm,
  VALID_COURSE_FIELD_NAMES,
} from "@/types/course";

const COURSE_EDIT_SECTION_DEFINITIONS = [
  {
    id: "basics",
    title: "Class basics",
    description: "The name, description, and school category students will recognize.",
    keys: ["program", "intake", "title", "description", "category", "level", "section"],
  },
  {
    id: "schedule",
    title: "Schedule",
    description: "Start and end dates for this class.",
    keys: ["start_date", "end_date", "id_card_expiry_date"],
  },
  {
    id: "details",
    title: "Class details",
    description: "Subject, billing, exam, and internal school details.",
    keys: [
      "subject",
      "payment_plan",
      "code",
      "batch_number",
      "exam_session_date",
      "exam_board",
    ],
  },
] as const;

/** All column keys that belong in one of the three fixed section cards (never "Other"). */
const ALL_FIXED_SECTION_FIELD_KEYS: ReadonlySet<string> = new Set(
  COURSE_EDIT_SECTION_DEFINITIONS.flatMap((d) => [...d.keys])
);

/**
 * Deduplicate while preserving first occurrence order, after normalizing.
 */
function dedupeFieldOrderPreservingOrder(fieldOrder: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of fieldOrder) {
    const k = normalizeCourseFieldKeyForForm(raw);
    if (!k || seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(k);
  }
  return out;
}

export type CourseEditSection = {
  id: string;
  title: string;
  description?: string;
  keys: string[];
};

/**
 * Splits the dynamic `fieldOrder` into section cards while preserving order within each section.
 * "Other" only lists fields that are **not** in Course details, Schedule, or Payment/subject/exams
 * (e.g. custom fields). Standard columns are never placed in "Other"—even if `course_fields` used
 * odd casing, duplicates, or list order that previously confused the old `!claimed` check.
 */
export function buildCourseEditSectionsFromFieldOrder(
  fieldOrder: string[]
): CourseEditSection[] {
  const order = dedupeFieldOrderPreservingOrder(fieldOrder);
  const sections: CourseEditSection[] = [];

  for (const def of COURSE_EDIT_SECTION_DEFINITIONS) {
    const defKeys = def.keys as readonly string[];
    const keys = order.filter((k) => defKeys.includes(k));
    if (keys.length > 0) {
      sections.push({
        id: def.id,
        title: def.title,
        description: def.description,
        keys: [...keys],
      });
    }
  }

  const validCourseFieldKeys = new Set<string>([...VALID_COURSE_FIELD_NAMES]);
  const otherKeys = order.filter(
    (k) => validCourseFieldKeys.has(k) && !ALL_FIXED_SECTION_FIELD_KEYS.has(k)
  );
  if (otherKeys.length > 0) {
    sections.push({
      id: "other",
      title: "Other",
      description: "Additional fields configured for your school.",
      keys: otherKeys,
    });
  }

  return sections;
}
