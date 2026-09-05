export function pronounForGender(
  gender: string | null | undefined,
): "he" | "she" | "they" {
  if (gender === "MALE") return "he";
  if (gender === "FEMALE") return "she";
  return "they";
}
