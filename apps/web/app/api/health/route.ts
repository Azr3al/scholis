/**
 * Liveness probe for Railway.
 *
 * Deliberately does not touch the database: this answers "is the process up",
 * and conflating that with "is Postgres reachable" makes the platform restart a
 * healthy web service during a database blip. Readiness gets its own endpoint
 * in Phase 8 if it earns one.
 */
export function GET() {
  return Response.json({ status: 'ok' });
}
