// Pulling a Scholis paper id out of whatever a teacher pasted.
//
// Scholis exposes no endpoint that lists a school's papers. That is deliberate on
// their side rather than an omission: enumerating assessments is not something an
// API key scoped to one school should be able to do across the whole product. So
// the id has to come from the teacher, and the friendliest artefact a teacher has
// is the paper's own link.

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * The paper id in `input`, or an empty string if there is not one.
 *
 * Accepts a bare id, or any URL or sentence containing one — a bare id is simply
 * the case where the first match is the whole string. Returns "" rather than
 * throwing because this runs on every keystroke in a form field, where "not a
 * valid id yet" is the normal state rather than an error.
 */
export function extractTestId(input: string): string {
  // Lower-cased: Postgres and Django both fold UUID case, so an upper-case paste
  // would bind the same paper, but showing two different spellings of one id in
  // the papers table reads like two papers.
  return input.trim().match(UUID_PATTERN)?.[0].toLowerCase() ?? "";
}

/** True when `input` holds something that could be a paper id. */
export function hasTestId(input: string): boolean {
  return extractTestId(input) !== "";
}
