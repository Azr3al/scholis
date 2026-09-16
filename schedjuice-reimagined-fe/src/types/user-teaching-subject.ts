export enum TeachingSubjectEntityType {
  Subject = "subject",
  ProgramLevel = "program_level",
  Category = "category",
}

export type TeachingSubjectSearchOption = {
  value: string;
  label: string;
  entity_type: TeachingSubjectEntityType;
};

export type TeachingSubjectSearchResponse = {
  allow_level_category_search: boolean;
  options: TeachingSubjectSearchOption[];
};

export type UserTeachingSubjectCategory = { id: number; name: string };
export type UserTeachingSubjectLevel = {
  id: number;
  name: string;
  default_category: UserTeachingSubjectCategory | null;
};
export type UserTeachingSubjectSubject = { id: number; name: string };

export type UserTeachingSubject = {
  id: number;
  entity_type: TeachingSubjectEntityType;
  subject_id: number | null;
  program_level_id: number | null;
  category_id: number | null;
  subject: UserTeachingSubjectSubject | null;
  program_level: UserTeachingSubjectLevel | null;
  category: UserTeachingSubjectCategory | null;
  sort_order: number;
  created_at: string;
};

export type UserTeachingSubjectInput = {
  entity_type: TeachingSubjectEntityType;
  subject_id?: number;
  program_level_id?: number;
  category_id?: number;
};

export function teachingSubjectSelectionValue(
  entityType: TeachingSubjectEntityType,
  id: number,
): string {
  return `${entityType}:${id}`;
}

export function parseTeachingSubjectSelection(
  value: string,
): UserTeachingSubjectInput | null {
  const [entityType, idStr] = value.split(":");
  const id = Number(idStr);
  if (
    !entityType ||
    !idStr ||
    Number.isNaN(id) ||
    !Object.values(TeachingSubjectEntityType).includes(
      entityType as TeachingSubjectEntityType,
    )
  ) {
    return null;
  }
  const typed = entityType as TeachingSubjectEntityType;
  if (typed === TeachingSubjectEntityType.Subject) {
    return { entity_type: typed, subject_id: id };
  }
  if (typed === TeachingSubjectEntityType.ProgramLevel) {
    return { entity_type: typed, program_level_id: id };
  }
  return { entity_type: typed, category_id: id };
}

export function teachingSubjectRowLabel(row: UserTeachingSubject): string {
  if (row.entity_type === TeachingSubjectEntityType.Subject) {
    return row.subject?.name ?? "Subject";
  }
  if (row.entity_type === TeachingSubjectEntityType.ProgramLevel) {
    return row.program_level?.name ?? "Level";
  }
  return row.category?.name ?? "Category";
}

export function teachingSubjectSelectionFromRow(row: UserTeachingSubject): string {
  if (row.entity_type === TeachingSubjectEntityType.Subject) {
    const id = row.subject_id ?? row.subject?.id;
    if (id != null) {
      return teachingSubjectSelectionValue(TeachingSubjectEntityType.Subject, id);
    }
  }
  if (row.entity_type === TeachingSubjectEntityType.ProgramLevel) {
    const id = row.program_level_id ?? row.program_level?.id;
    if (id != null) {
      return teachingSubjectSelectionValue(TeachingSubjectEntityType.ProgramLevel, id);
    }
  }
  if (row.entity_type === TeachingSubjectEntityType.Category) {
    const id = row.category_id ?? row.category?.id;
    if (id != null) {
      return teachingSubjectSelectionValue(TeachingSubjectEntityType.Category, id);
    }
  }
  return "";
}
