/**
 * Minimal Program type for SDK list hooks.
 */

export type Program = {
  id: number;
  name: string;
  course_creation_method?: string;
  subject_strategy?: string;
  is_active?: boolean;
};
