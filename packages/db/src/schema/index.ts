import type { apiClientSecrets, apiClients } from './api-clients';
import type { attemptEvents, attempts, mutations, responses } from './attempts';
import type { accounts, sessions, verifications } from './auth';
import type { events } from './events';
import type { idempotencyKeys } from './idempotency';
import type { invitations } from './invitations';
import type { launchTokens } from './launch-tokens';
import type { organizations, users } from './organizations';
import type { questionOptions, questions, sections, shortAnswerKeys } from './questions';
import type { testTagAssignments, testTags } from './tags';
import type { teacherSsoTickets } from './teacher-sso';
import type { tests } from './tests';
import type { webhookDeliveries, webhookEndpoints } from './webhooks';

export { apiClientKind, apiClientSecrets, apiClients } from './api-clients';
export {
  attemptEventKind,
  attemptEvents,
  attemptStatus,
  attempts,
  mutations,
  responses,
} from './attempts';
export { accounts, sessions, verifications } from './auth';
export { events } from './events';
export { idempotencyKeys } from './idempotency';
export { invitations } from './invitations';
export { launchTokens } from './launch-tokens';
export { organizations, userRole, users } from './organizations';
export { questionOptions, questionType, questions, sections, shortAnswerKeys } from './questions';
export { testTagAssignments, testTags } from './tags';
export { teacherSsoTickets } from './teacher-sso';
export { testStatus, tests } from './tests';
export { webhookDeliveries, webhookEndpoints } from './webhooks';

/**
 * Row types, inferred rather than hand-written.
 *
 * `data/` maps these to domain types from `@scholis/schema`. Nothing outside
 * `data/` should name a `*Row` type — a row shape leaking into a service is the
 * database dictating the domain vocabulary.
 */
export type OrganizationRow = typeof organizations.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type TestRow = typeof tests.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;
export type InvitationRow = typeof invitations.$inferSelect;
export type AttemptEventRow = typeof attemptEvents.$inferSelect;
export type SectionRow = typeof sections.$inferSelect;
export type TestTagRow = typeof testTags.$inferSelect;
export type TestTagAssignmentRow = typeof testTagAssignments.$inferSelect;
export type QuestionOptionRow = typeof questionOptions.$inferSelect;
export type ShortAnswerKeyRow = typeof shortAnswerKeys.$inferSelect;
export type AttemptRow = typeof attempts.$inferSelect;
export type ResponseRow = typeof responses.$inferSelect;
export type MutationRow = typeof mutations.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type IdempotencyKeyRow = typeof idempotencyKeys.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type VerificationRow = typeof verifications.$inferSelect;

export type ApiClientRow = typeof apiClients.$inferSelect;
export type ApiClientSecretRow = typeof apiClientSecrets.$inferSelect;
export type LaunchTokenRow = typeof launchTokens.$inferSelect;
export type TeacherSsoTicketRow = typeof teacherSsoTickets.$inferSelect;
export type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;

export type NewTestRow = typeof tests.$inferInsert;
export type NewQuestionRow = typeof questions.$inferInsert;
export type NewSectionRow = typeof sections.$inferInsert;
export type NewAttemptRow = typeof attempts.$inferInsert;
export type NewResponseRow = typeof responses.$inferInsert;
export type NewEventRow = typeof events.$inferInsert;
