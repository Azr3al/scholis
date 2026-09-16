import { axiosClient } from "@/lib/api";
import type {
  ScholisCatchUpResult,
  ScholisConnectionStatus,
  ScholisLaunchTicket,
  ScholisPaperLink,
  ScholisScore,
  ScholisSyncReport,
  ScholisTeacherLink,
} from "@/types/scholis";

type Envelope<T> = { isError: boolean; message: string; data: T };

/**
 * The message Scholis or this backend wrote for a person, if there is one.
 *
 * Worth extracting rather than showing `String(error)`: these endpoints return
 * explanations meant to be read ("That school already exists at Scholis but this
 * tenant has no API key for it"), and an `AxiosError: Request failed with status
 * code 400` in a toast throws all of that away.
 */
export function scholisErrorMessage(error: unknown, fallback: string): string {
  const message = (
    error as { response?: { data?: { message?: unknown } } }
  )?.response?.data?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

// ---------------------------------------------------------------------------
// connection — school-level setup, gated on organization.manage
// ---------------------------------------------------------------------------

/** Current state, or `{ connected: false }` when this school has never connected. */
export async function getScholisConnection(): Promise<ScholisConnectionStatus> {
  const res = await axiosClient.get<Envelope<ScholisConnectionStatus>>(
    "scholis/connect",
  );
  return res.data.data;
}

/**
 * Provision this school at Scholis and register the webhook.
 *
 * Idempotent, so a settings screen can offer "Connect" without first having to
 * know whether it is already connected — pressing it twice is safe.
 */
export async function connectScholis(
  body?: { school_name?: string },
): Promise<ScholisConnectionStatus> {
  const res = await axiosClient.post<Envelope<ScholisConnectionStatus>>(
    "scholis/connect",
    body ?? {},
  );
  return res.data.data;
}

/**
 * Replay events this tenant missed, from Scholis's own event log.
 *
 * The recovery path for an outage, a rotated signing secret, or a webhook URL
 * that moved. Runs inline rather than queued: an administrator asking "did we
 * miss anything?" deserves an answer now, not one that arrives later by celery.
 */
export async function catchUpScholisEvents(): Promise<ScholisCatchUpResult> {
  const res = await axiosClient.post<Envelope<ScholisCatchUpResult>>(
    "scholis/catch-up",
    {},
  );
  return res.data.data;
}

// ---------------------------------------------------------------------------
// papers — which gradebook column a Scholis paper's marks land in
// ---------------------------------------------------------------------------

export async function listScholisPapers(): Promise<ScholisPaperLink[]> {
  const res = await axiosClient.get<Envelope<ScholisPaperLink[]>>("scholis/papers");
  return res.data.data;
}

/**
 * Bind a paper to a column. Re-binding moves it rather than creating a second
 * binding, so there are never two columns both trying to hold the same marks.
 *
 * Omitting `column_id` stores the binding with no column: the marks are kept and
 * show as waiting to be placed. A `column_id` that does not exist is rejected
 * rather than quietly downgraded to that, because the caller asked for marks to
 * land somewhere specific.
 */
export async function linkScholisPaper(body: {
  scholis_test_id: string;
  column_id?: number | null;
  course_id?: number | string | null;
  title?: string;
}): Promise<ScholisPaperLink> {
  const res = await axiosClient.post<Envelope<ScholisPaperLink>>(
    "scholis/papers",
    body,
  );
  return res.data.data;
}

// ---------------------------------------------------------------------------
// scores
// ---------------------------------------------------------------------------

/**
 * Pull released marks now and project them into the gradebook.
 *
 * A webhook does this automatically; this exists because a delivery can be
 * missed, and "pull again" is a much better answer to a missing mark than "wait
 * and see". Pulling is idempotent — scores upsert on attempt id — so re-running
 * it after a regrade amends marks rather than duplicating them.
 */
export async function syncScholisScores(body?: {
  course_ref?: string;
  since?: string;
}): Promise<ScholisSyncReport> {
  const res = await axiosClient.post<Envelope<ScholisSyncReport>>(
    "scholis/scores",
    body ?? {},
  );
  return res.data.data;
}

/**
 * The marks already stored, exact and decimal.
 *
 * Filters narrow server-side. That matters because the endpoint caps at the 500
 * most recent rows: filtering in the browser after the cap would make one busy
 * course crowd every other course out of the window, and the page would look like
 * marks were missing rather than like a list was truncated.
 */
export async function listScholisScores(filters?: {
  course_ref?: string | number;
  paper_link_id?: number;
  student_id?: number | string;
}): Promise<ScholisScore[]> {
  const res = await axiosClient.get<Envelope<ScholisScore[]>>("scholis/scores", {
    params: filters,
  });
  return res.data.data;
}

// ---------------------------------------------------------------------------
// one-time links
// ---------------------------------------------------------------------------

/**
 * Mint a link admitting one student to one paper.
 *
 * The returned URL is a bearer credential and is not stored anywhere — not here,
 * not in the backend. This response is the only copy that will ever exist, so if
 * it is closed without being handed over it has to be minted again.
 */
export async function mintScholisLaunch(body: {
  student_id: number | string;
  paper_link_id?: number;
  scholis_test_id?: string;
}): Promise<ScholisLaunchTicket> {
  const res = await axiosClient.post<Envelope<ScholisLaunchTicket>>(
    "scholis/launch",
    body,
  );
  return res.data.data;
}

/**
 * Mint a Scholis sign-in link for one teacher.
 *
 * Cannot create an account: a teacher Scholis has never heard of comes back as a
 * 404 and has to be invited at Scholis first. Scholis answers 404 both for "no
 * such teacher" and for "a teacher at another school" on purpose, so nothing here
 * can tell you which one it was.
 */
export async function mintScholisTeacherLink(body: {
  teacher_id?: number | string;
  email?: string;
}): Promise<ScholisTeacherLink> {
  const res = await axiosClient.post<Envelope<ScholisTeacherLink>>(
    "scholis/teacher-link",
    body,
  );
  return res.data.data;
}
