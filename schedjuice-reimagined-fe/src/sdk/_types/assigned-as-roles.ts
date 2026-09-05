/**
 * Minimal AssignedAsRole type for SDK list hooks.
 */

export type AssignedAsRole = {
  id: number;
  name: string;
  is_collision_enabled?: boolean;
  seniority?: "MAIN_TEACHER" | "ASSISTANT_TEACHER" | "OTHER";
  is_substitute?: boolean;
};
