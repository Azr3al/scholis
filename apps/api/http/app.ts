import { auth } from '@/lib/auth';
import { pingDb } from '@/lib/db';
import { toHttpResponse } from '@/lib/http';
import { signUp, signUpInput } from '@/server/accounts/sign-up';
import {
  acceptInvite,
  acceptInviteInput,
  getTeam,
  inviteMember,
  inviteMemberInput,
} from '@/server/accounts/team';
import { applyMutations, applyMutationsInput } from '@/server/attempts/apply-mutations';
import { getReleasedResult, getReleasedResultInput } from '@/server/attempts/get-released-result';
import { getTestPackage, getTestPackageInput } from '@/server/attempts/get-test-package';
import { startAttempt, startAttemptInput } from '@/server/attempts/start-attempt';
import { submitAttempt, submitAttemptInput } from '@/server/attempts/submit-attempt';
import { submitComment, submitCommentInput } from '@/server/attempts/submit-comment';
import { validationFailed } from '@/server/errors';
import { getAttemptMarking, getAttemptMarkingInput } from '@/server/grading/get-attempt-marking';
import { listComments, listCommentsInput } from '@/server/grading/list-comments';
import { listAttempts, listAttemptsInput } from '@/server/grading/list-attempts';
import { releaseResults, releaseResultsInput } from '@/server/grading/release-results';
import { scoreWrittenAnswer, scoreWrittenAnswerInput } from '@/server/grading/score-written-answer';
import { addDraftQuestions, addDraftQuestionsInput } from '@/server/tests/add-draft-questions';
import { addQuestion, addQuestionInput } from '@/server/tests/add-question';
import { createTest, createTestInput } from '@/server/tests/create-test';
import { deleteQuestion, deleteQuestionInput } from '@/server/tests/delete-question';
import { getTest, getTestInput } from '@/server/tests/get-test';
import { listTests } from '@/server/tests/list-tests';
import {
  assignQuestionSection,
  assignQuestionSectionInput,
  createSection,
  createSectionInput,
  deleteSection,
  deleteSectionInput,
  reorderSections,
  reorderSectionsInput,
  updateSection,
  updateSectionInput,
} from '@/server/tests/manage-sections';
import {
  createTag,
  createTagInput,
  deleteTag,
  deleteTagInput,
  listTags,
  setTestTags,
  setTestTagsInput,
  updateTag,
  updateTagInput,
} from '@/server/tests/manage-tags';
import { publishTest, publishTestInput } from '@/server/tests/publish-test';
import { reorderQuestions, reorderQuestionsInput } from '@/server/tests/reorder-questions';
import { updateQuestion, updateQuestionInput } from '@/server/tests/update-question';
import { updateTestInput, updateTestSettings } from '@/server/tests/update-test';
import {
  issueClient,
  issueClientInput,
  listClients,
  revokeClient,
  revokeClientInput,
  revokeSecret,
  revokeSecretInput,
  rotateClientSecret,
  rotateClientSecretInput,
} from '@/server/integrations/manage-clients';
import { launchAttempt, launchAttemptInput } from '@/server/integrations/launch-attempt';
import { listScores, listScoresInput } from '@/server/integrations/list-scores';
import {
  addWebhook,
  addWebhookInput,
  listEvents,
  listEventsInput,
  listWebhooks,
  removeWebhook,
  removeWebhookInput,
} from '@/server/integrations/manage-webhooks';
import { provisionOrg, provisionOrgInput } from '@/server/integrations/provision-org';
import { getFile } from '@/server/uploads/get-file';
import { uploadFile } from '@/server/uploads/upload-file';
import { zValidator } from '@hono/zod-validator';
import { startedAttemptSchema } from '@scholis/contracts';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authedContextFor, platformContextFor, publicContextFor } from './context';
import { devRoutesEnabled } from './dev-enabled';
import { devRoutes } from './dev-routes';
import { actorFromRequest, platformFromRequest } from './session';

// Every handler does the same four things: validate with the schema the service
// already declares, build a context, call one service, return.
//
// no-db-in-http keeps it that way.
export const api = new Hono().basePath('/api');

// Web is a separate origin now. credentials:true is the load-bearing bit —
// Better Auth's session is a cookie, and without it every authed request
// arrives anonymous.
api.use(
  '*',
  cors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

// Domain errors become status codes in exactly one place (lib/http.ts), so a
// new error code cannot silently become a 500 in half the routes.
api.onError((error) => toHttpResponse(error));

// Liveness. Deliberately touches nothing — if this process can answer, it is
// alive and must not be restarted. Wiring Postgres in here would turn a brief
// database blip into a restart loop across every replica at once.
api.get('/health', (c) => c.json({ status: 'ok' }));

// Readiness. This one does check Postgres, so a wrong DATABASE_URL fails the
// deploy rather than the first student to open a paper.
api.get('/ready', async (c) => {
  const database = await pingDb();
  return c.json({ status: database ? 'ready' : 'degraded', database }, database ? 200 : 503);
});

// Not mounted at all unless explicitly enabled, so the handlers aren't
// reachable rather than merely guarded.
if (devRoutesEnabled()) {
  api.route('/dev', devRoutes);
}

// Better Auth owns its own routes entirely.
api.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));

// ---------------------------------------------------------------------------
// Accounts and teams
//
// Sign-up and accepting an invitation are public because there is nobody to
// authenticate yet. Both create a user; neither is reachable from the sign-in
// path, which still never provisions.
// ---------------------------------------------------------------------------

api.post('/signup', zValidator('json', signUpInput), async (c) =>
  c.json(await signUp(publicContextFor(), c.req.valid('json')), 201),
);

api.post('/team/accept', zValidator('json', acceptInviteInput), async (c) =>
  c.json(await acceptInvite(publicContextFor(), c.req.valid('json')), 201),
);

api.get('/team', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await getTeam(ctx));
});

api.post('/team/invite', zValidator('json', inviteMemberInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await inviteMember(ctx, c.req.valid('json')), 201);
});

// ---------------------------------------------------------------------------
// Authoring — signed-in teachers
// ---------------------------------------------------------------------------

api.post('/tests', zValidator('json', createTestInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await createTest(ctx, c.req.valid('json')), 201);
});

api.post('/questions', zValidator('json', addQuestionInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await addQuestion(ctx, c.req.valid('json')), 201);
});

api.post('/questions/draft-batch', zValidator('json', addDraftQuestionsInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await addDraftQuestions(ctx, c.req.valid('json')), 201);
});

api.post('/questions/update', zValidator('json', updateQuestionInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await updateQuestion(ctx, c.req.valid('json')));
});

api.post('/questions/reorder', zValidator('json', reorderQuestionsInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await reorderQuestions(ctx, c.req.valid('json')));
});

api.post('/questions/delete', zValidator('json', deleteQuestionInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await deleteQuestion(ctx, c.req.valid('json')));
});

// Multipart rather than JSON: a base64 body would inflate every upload by a
// third and buy nothing, since nothing else on this route is JSON.
api.post('/uploads', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));

  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) throw validationFailed('Attach a file in the "file" field.');

  const body = new Uint8Array(await file.arrayBuffer());
  return c.json(await uploadFile(ctx, { contentType: file.type, body }), 201);
});

// Public — a student sitting a test has no session, so question images have to
// be fetchable without one. See server/uploads/get-file.ts.
//
// The key is two segments, so the wildcard is deliberate; getFile validates the
// shape before anything touches a disk.
api.get('/files/:orgId/:name', async (c) => {
  const key = `${c.req.param('orgId')}/${c.req.param('name')}`;
  const { body, contentType } = await getFile(publicContextFor(), key);

  // A plain Response rather than c.body: Hono types its body as a
  // Uint8Array<ArrayBuffer>, and what comes off a disk is
  // Uint8Array<ArrayBufferLike>. Response takes either.
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // The stored type is trusted only as far as nosniff allows. Without this
      // a file a browser decides looks like HTML would run on our origin.
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      // Keys carry a UUID and objects are never rewritten, so this is safe to
      // pin. It is also what makes a question image usable offline.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// Sections are headings over the question list, so they live beside the other
// authoring routes rather than getting a namespace of their own.
api.post('/sections', zValidator('json', createSectionInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await createSection(ctx, c.req.valid('json')), 201);
});

api.post('/sections/update', zValidator('json', updateSectionInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await updateSection(ctx, c.req.valid('json')));
});

api.post('/sections/delete', zValidator('json', deleteSectionInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await deleteSection(ctx, c.req.valid('json')));
});

api.post('/sections/reorder', zValidator('json', reorderSectionsInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await reorderSections(ctx, c.req.valid('json')));
});

api.post('/questions/section', zValidator('json', assignQuestionSectionInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await assignQuestionSection(ctx, c.req.valid('json')));
});

api.get('/tags', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await listTags(ctx));
});

api.post('/tags', zValidator('json', createTagInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await createTag(ctx, c.req.valid('json')), 201);
});

api.post('/tags/update', zValidator('json', updateTagInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await updateTag(ctx, c.req.valid('json')));
});

api.post('/tags/delete', zValidator('json', deleteTagInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await deleteTag(ctx, c.req.valid('json')));
});

api.post('/tests/tags', zValidator('json', setTestTagsInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await setTestTags(ctx, c.req.valid('json')));
});

api.post('/tests/publish', zValidator('json', publishTestInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await publishTest(ctx, c.req.valid('json')));
});

api.post('/tests/update', zValidator('json', updateTestInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await updateTestSettings(ctx, c.req.valid('json')));
});

api.get('/tests', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await listTests(ctx));
});

api.get('/tests/:testId', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await getTest(ctx, getTestInput.parse({ testId: c.req.param('testId') })));
});

api.get('/tests/:testId/attempts', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(
    await listAttempts(ctx, listAttemptsInput.parse({ testId: c.req.param('testId') })),
  );
});

api.get('/tests/:testId/comments', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(
    await listComments(ctx, listCommentsInput.parse({ testId: c.req.param('testId') })),
  );
});

api.get('/attempts/:attemptId/marking', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(
    await getAttemptMarking(
      ctx,
      getAttemptMarkingInput.parse({ attemptId: c.req.param('attemptId') }),
    ),
  );
});

// ---------------------------------------------------------------------------
// Grading — signed-in teachers
// ---------------------------------------------------------------------------

api.post('/grading/score', zValidator('json', scoreWrittenAnswerInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await scoreWrittenAnswer(ctx, c.req.valid('json')));
});

api.post('/grading/release', zValidator('json', releaseResultsInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await releaseResults(ctx, c.req.valid('json')));
});

// ---------------------------------------------------------------------------
// Taking — no account. Authorisation comes from the test code and, once an
// attempt exists, the attempt token.
// ---------------------------------------------------------------------------

api.get('/take/:code', async (c) => {
  const input = getTestPackageInput.parse({ code: c.req.param('code') });
  return c.json(await getTestPackage(publicContextFor(), input));
});

api.post('/take/start', zValidator('json', startAttemptInput), async (c) => {
  // Flattened onto the contract. The service returns { attempt, token }; the
  // client was typed flat and neither side noticed — which is the whole reason
  // these shapes now live in @scholis/contracts.
  const { attempt, token } = await startAttempt(publicContextFor(), c.req.valid('json'));
  return c.json(
    startedAttemptSchema.parse({
      id: attempt.id,
      takerName: attempt.takerName,
      status: attempt.status,
      score: attempt.score,
      maxScore: attempt.maxScore,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      releasedAt: attempt.releasedAt?.toISOString() ?? null,
      overdueSeconds: attempt.overdueSeconds,
      token,
      startedAt: attempt.startedAt?.toISOString() ?? null,
      serverDeadlineAt: attempt.serverDeadlineAt?.toISOString() ?? null,
      questionOrder: attempt.questionOrder,
    }),
    201,
  );
});

api.post('/take/sync', zValidator('json', applyMutationsInput), async (c) => {
  return c.json(await applyMutations(publicContextFor(), c.req.valid('json')));
});

api.post('/take/submit', zValidator('json', submitAttemptInput), async (c) => {
  return c.json(await submitAttempt(publicContextFor(), c.req.valid('json')));
});

api.post('/take/comment', zValidator('json', submitCommentInput), async (c) => {
  return c.json(await submitComment(publicContextFor(), c.req.valid('json')));
});

// POST, not GET — it carries the attempt token in the body rather than putting
// a credential in a URL that ends up in browser history and server logs.
api.post('/take/result', zValidator('json', getReleasedResultInput), async (c) => {
  return c.json(await getReleasedResult(publicContextFor(), c.req.valid('json')));
});

// ---------------------------------------------------------------------------
// Integration — other systems, authenticating with an API key
//
// Two tiers. `/integration/orgs` takes a platform credential, which belongs to
// the calling product and may create schools but read nothing inside one.
// Everything else takes an org credential and is scoped to exactly one school
// by the same `actor.orgId` a signed-in teacher would carry — which is why
// none of the services underneath had to change.
// ---------------------------------------------------------------------------

api.post('/integration/orgs', zValidator('json', provisionOrgInput), async (c) => {
  const ctx = platformContextFor(await platformFromRequest(c.req.raw));
  const result = await provisionOrg(ctx, c.req.valid('json'));
  // 200 on a repeat, 201 on a fresh one: a caller retrying after a timeout can
  // tell whether it was the one that created the school.
  return c.json(result, result.created ? 201 : 200);
});

api.post('/integration/launch', zValidator('json', launchAttemptInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await launchAttempt(ctx, c.req.valid('json')), 201);
});

api.get('/integration/scores', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  const query = listScoresInput.parse({
    courseRef: c.req.query('courseRef'),
    from: c.req.query('from'),
    to: c.req.query('to'),
  });
  return c.json({ scores: await listScores(ctx, query) });
});

api.get('/integration/events', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  const limit = c.req.query('limit');
  const query = listEventsInput.parse({
    since: c.req.query('since'),
    limit: limit === undefined ? undefined : Number(limit),
  });
  return c.json(await listEvents(ctx, query));
});

api.get('/integration/webhooks', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json({ endpoints: await listWebhooks(ctx) });
});

api.post('/integration/webhooks', zValidator('json', addWebhookInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await addWebhook(ctx, c.req.valid('json')), 201);
});

api.post('/integration/webhooks/delete', zValidator('json', removeWebhookInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await removeWebhook(ctx, c.req.valid('json')));
});

// ---------------------------------------------------------------------------
// API keys — the dashboard only
//
// Every one of these refuses a machine caller. If a key could mint a key,
// revoking a leaked one would not contain the breach.
// ---------------------------------------------------------------------------

api.get('/keys', async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json({ keys: await listClients(ctx) });
});

api.post('/keys', zValidator('json', issueClientInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await issueClient(ctx, c.req.valid('json')), 201);
});

api.post('/keys/rotate', zValidator('json', rotateClientSecretInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await rotateClientSecret(ctx, c.req.valid('json')), 201);
});

api.post('/keys/revoke', zValidator('json', revokeClientInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await revokeClient(ctx, c.req.valid('json')));
});

api.post('/keys/revoke-secret', zValidator('json', revokeSecretInput), async (c) => {
  const ctx = authedContextFor(await actorFromRequest(c.req.raw));
  return c.json(await revokeSecret(ctx, c.req.valid('json')));
});
