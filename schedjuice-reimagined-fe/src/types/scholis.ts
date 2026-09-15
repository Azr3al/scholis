// Scholis assessment integration.
//
// These mirror the Python serializers in schedjuice-reimagined-be/app_scholis/
// serializers.py field for field. Two conventions carry over from there and are
// worth knowing before changing anything:
//
//   - Decimals arrive as strings. A JSON number would round-trip through
//     JavaScript as a double, and 12.5 survives that while 12.55 does not
//     necessarily. Marks are the one place where a display artefact and a real
//     value must not be distinguishable only by luck.
//   - `sections` is Scholis's own payload, stored and returned untouched, so its
//     keys stay camelCase while everything around them is snake_case.

/** One section of a paper, exactly as Scholis reported it. */
export type ScholisSection = {
  sectionId: string | null;
  title: string;
  score: number;
  maxScore: number;
};

/** What an administrator is allowed to see about the connection. No secrets. */
export type ScholisConnectionStatus = {
  connected: boolean;
  external_ref?: string;
  school_name?: string;
  scholis_org_id?: string | null;
  /** Public half of the key. Identifies it in Scholis's dashboard and audit log. */
  api_key_id?: string;
  webhook_registered?: boolean;
  webhook_endpoint_id?: string | null;
  webhook_url?: string | null;
  /** Catch-up cursor: the highest event sequence this tenant has processed. */
  last_event_seq?: number | null;
  connected_at?: string | null;
};

/** The column a paper's marks land in, when a teacher has placed it. */
export type ScholisPaperColumn = {
  id: number;
  title: string;
  max_marks: number | null;
  sheet_id: number;
};

/** A Scholis paper bound to a gradebook column. */
export type ScholisPaperLink = {
  id: number;
  scholis_test_id: string;
  scholis_test_title: string;
  /** Decimal as a string. */
  max_score: string | null;
  sections: ScholisSection[];
  is_active: boolean;
  /** Null until a teacher places the paper: marks are stored but have nowhere to go. */
  column: ScholisPaperColumn | null;
  course_id: number | null;
  score_count: number;
};

/** One student's released result, as stored here. */
export type ScholisScore = {
  attempt_id: string;
  student_id: number | null;
  /** This system's own student id, echoed back by Scholis. */
  student_ref: string;
  /** Whatever the student typed when starting. Display only — never matched on. */
  taker_name: string;
  /** Exact decimal, as a string. */
  score: string;
  max_score: string;
  sections: ScholisSection[];
  submitted_at: string | null;
  released_at: string | null;
  /** Null until this row has been projected into the gradebook. */
  synced_at: string | null;
  /** The integer that was written to ResultCell.marks. */
  synced_marks: number | null;
  /**
   * What the exact score rounds to. Surfaced deliberately: the gradebook holds a
   * rounded copy, and hidden rounding is what turns into a disputed report card.
   */
  rounded_marks: number;
  scholis_test_id: string | null;
  column_id: number | null;
};

/** What a sync did, in counts. Every skip is accounted for, not dropped. */
export type ScholisSyncReport = {
  fetched: number;
  stored: number;
  written_to_gradebook: number;
  /** Marks stored but with no column to land in yet. */
  unlinked_papers: number;
  /** Walk-in attempts: marks with no student of ours to attribute them to. */
  without_student: number;
  errors: string[];
  ok: boolean;
};

/**
 * A one-time launch URL. A bearer credential for an exam: whoever holds it sits
 * the paper as that student. It is returned once and never stored, so this is the
 * only copy that will ever exist.
 */
export type ScholisLaunchTicket = {
  url: string;
  expires_at: string | null;
  taker_ref: string;
  scholis_test_id: string;
};

/** A one-time sign-in URL for a teacher. Same handling as a launch ticket. */
export type ScholisTeacherLink = {
  url: string;
  expires_at: string | null;
  email: string;
};

/** What a manual catch-up did. */
export type ScholisCatchUpResult = {
  schema: string;
  seen: number;
  applied: number;
  duplicates?: number;
  cursor?: number | null;
  /** Present instead of the counts when there was nothing to catch up. */
  skipped?: string;
};
