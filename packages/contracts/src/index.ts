// Shapes that cross the wire between apps/web and apps/api.
//
// Exists because the two are separate deployables and web can't import from
// api. Without this the request and response shapes get hand-declared on both
// sides and drift silently — the client keeps compiling while the server has
// moved on.
//
// It also keeps database rows off the wire. Services used to return TestRecord,
// which is TestRow, so columns like org_id and lti_context_id were being
// serialised to clients that have no business seeing them.
export {
  authoredChoiceOptionSchema,
  authoredQuestionSchema,
  testDetailSchema,
  testStatusSchema,
  testSummarySchema,
  testTagSchema,
  testTagSummarySchema,
  type AuthoredQuestion,
  type TestDetail,
  type TestSummary,
  type TestTag,
  type TestTagSummary,
} from './tests';

export {
  attemptCommentSchema,
  attemptCommentsViewSchema,
  attemptEventSchema,
  attemptMarkingViewSchema,
  attemptSummarySchema,
  gradingStatusSchema,
  markingItemSchema,
  releasedResultSchema,
  startedAttemptSchema,
  submittedCommentSchema,
  type AttemptComment,
  type AttemptCommentsView,
  type AttemptEvent,
  type AttemptMarkingView,
  type AttemptSummary,
  type GradingStatus,
  type MarkingItem,
  type ReleasedResult,
  type StartedAttempt,
  type SubmittedComment,
} from './attempts';

export { uploadedFileSchema, type UploadedFile } from './uploads';
