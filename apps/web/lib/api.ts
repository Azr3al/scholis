import type {
  AttemptComment,
  AttemptMarkingView,
  AttemptSummary,
  AuthoredQuestion,
  GradingStatus,
  ReleasedResult,
  StartedAttempt,
  SubmittedComment,
  TestDetail,
  TestSummary,
  TestTag,
  UploadedFile,
} from '@scholis/contracts';
import type { Mutation, RichText, Section, SyncResponse, TestPackage } from '@scholis/schema';

export type {
  AttemptComment,
  AttemptMarkingView,
  AttemptSummary,
  AuthoredQuestion,
  GradingStatus,
  ReleasedResult,
  StartedAttempt,
  SubmittedComment,
  TestDetail,
  TestSummary,
  TestTag,
  UploadedFile,
};

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Two error shapes, because two producers share this client.
 *
 * Scholis routes nest under `error`; Better Auth answers flat with `message`
 * and `code` at the top level. Reading only the nested form silently turned
 * every Better Auth refusal into "Something went wrong." — the status code was
 * right and the reason was thrown away, which is the worst combination to
 * debug against.
 */
const errorFrom = (status: number, body: unknown): ApiError => {
  const flat = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  const nested = flat?.error;
  const source =
    typeof nested === 'object' && nested !== null ? (nested as Record<string, unknown>) : flat;

  const message = typeof source?.message === 'string' ? source.message : undefined;
  const code = typeof source?.code === 'string' ? source.code : undefined;

  return new ApiError(status, code ?? 'unknown', message ?? 'Something went wrong.');
};

// credentials:'include' on everything — the session is a cookie on another
// origin, so omitting it silently makes every authed call anonymous.
const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  // Headers, not a plain object — HeadersInit can be an array, and spreading
  // one into an object gives you numeric keys.
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  const res = await fetch(`${BASE}${path}`, { ...init, credentials: 'include', headers });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw errorFrom(res.status, body);
  }

  return res.json() as Promise<T>;
};

const post = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  // --- authoring -----------------------------------------------------------
  createTest: (input: {
    title: string;
    timeLimitMinutes: number | null;
    allowNavigation: boolean;
    maxAttempts: number;
    introBody?: RichText;
    outroBody?: RichText;
    idempotencyKey?: string;
  }) => post<TestSummary>('/api/tests', input),

  addQuestion: (input: { testId: string; question: unknown; idempotencyKey?: string }) =>
    post<AuthoredQuestion>('/api/questions', input),

  addDraftQuestions: (input: {
    testId: string;
    kind: 'single' | 'multi' | 'short' | 'essay';
    count: number;
  }) => post<AuthoredQuestion[]>('/api/questions/draft-batch', input),

  updateQuestion: (input: { questionId: string; question: unknown }) =>
    post<AuthoredQuestion>('/api/questions/update', input),

  reorderQuestions: (input: { testId: string; questionIds: string[] }) =>
    post<{ questionIds: string[] }>('/api/questions/reorder', input),

  deleteQuestion: (questionId: string) =>
    post<{ deleted: true }>('/api/questions/delete', { questionId }),

  // --- sections ------------------------------------------------------------
  // --- accounts and teams --------------------------------------------------
  signUp: (input: { name: string; email: string; teamName?: string }) =>
    post<{ orgId: string; orgName: string; userId: string; email: string }>('/api/signup', input),

  acceptInvite: (input: { token: string; name: string }) =>
    post<{ orgId: string; email: string }>('/api/team/accept', input),

  /**
   * Trade a one-time ticket for a staff session.
   *
   * A Better Auth endpoint rather than one of ours, so the path carries the
   * `/auth` prefix. It must go through this client and therefore through the
   * Next rewrite: the response sets the session cookie, and that only lands
   * first-party if the browser sees the web origin. See `next.config.ts`.
   */
  exchangeTeacherSso: (input: { ticket: string }) =>
    post<{ status: boolean }>('/api/auth/sso/exchange', input),

  getTeam: () =>
    request<{
      members: { id: string; email: string; name: string; role: 'owner' | 'teacher' }[];
      invites: { id: string; email: string; expiresAt: string }[];
    }>('/api/team'),

  inviteMember: (input: { email: string }) =>
    post<{ email: string; url: string }>('/api/team/invite', input),

  createSection: (input: { testId: string; title?: string; description?: RichText | null }) =>
    post<Section>('/api/sections', input),

  updateSection: (input: {
    testId: string;
    sectionId: string;
    title: string;
    description: RichText | null;
  }) => post<Section>('/api/sections/update', input),

  deleteSection: (input: { testId: string; sectionId: string }) =>
    post<{ deleted: true }>('/api/sections/delete', input),

  reorderSections: (input: { testId: string; sectionIds: string[] }) =>
    post<{ sectionIds: string[] }>('/api/sections/reorder', input),

  assignQuestionSection: (input: {
    testId: string;
    questionId: string;
    sectionId: string | null;
  }) => post<{ questionId: string; sectionId: string | null }>('/api/questions/section', input),

  listTags: () => request<TestTag[]>('/api/tags'),

  createTag: (input: { name: string }) => post<TestTag>('/api/tags', input),

  updateTag: (input: { tagId: string; name: string }) => post<TestTag>('/api/tags/update', input),

  deleteTag: (tagId: string) => post<{ deleted: true }>('/api/tags/delete', { tagId }),

  setTestTags: (input: { testId: string; tagIds: string[] }) =>
    post<{ testId: string; tagIds: string[] }>('/api/tests/tags', input),

  publishTest: (testId: string) => post<TestSummary>('/api/tests/publish', { testId }),

  updateTest: (input: {
    testId: string;
    title: string;
    timeLimitMinutes: number | null;
    allowNavigation: boolean;
    testTakingMode: boolean;
    maxAttempts: number;
    introBody: RichText;
    outroBody: RichText;
    randomizeQuestionOrder: boolean;
  }) => post<TestSummary>('/api/tests/update', input),

  listTests: () => request<TestSummary[]>('/api/tests'),

  getTest: (testId: string) => request<TestDetail>(`/api/tests/${testId}`),

  // --- grading -------------------------------------------------------------
  listAttempts: (testId: string) =>
    request<{ attempts: AttemptSummary[]; status: GradingStatus }>(`/api/tests/${testId}/attempts`),

  getAttemptMarking: (attemptId: string) =>
    request<AttemptMarkingView>(`/api/attempts/${attemptId}/marking`),

  /**
   * Multipart, so it bypasses `request` deliberately: that helper sets a JSON
   * content type, and setting any content type by hand on a FormData body
   * drops the multipart boundary the server needs. Letting fetch set it is the
   * whole trick.
   */
  uploadFile: async (file: Blob, filename = 'upload'): Promise<UploadedFile> => {
    const form = new FormData();
    form.append('file', file, filename);

    const res = await fetch(`${BASE}/api/uploads`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });

    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      throw errorFrom(res.status, body);
    }

    return res.json() as Promise<UploadedFile>;
  },

  // --- taking --------------------------------------------------------------
  getTestPackage: (code: string) => request<TestPackage>(`/api/take/${encodeURIComponent(code)}`),

  startAttempt: (input: { code: string; takerName: string; takerRef: string | null }) =>
    post<StartedAttempt>('/api/take/start', input),

  sync: (input: { attemptId: string; token: string; mutations: Mutation[] }) =>
    post<SyncResponse>('/api/take/sync', input),

  submitAttempt: (input: { attemptId: string; token: string }) =>
    post<AttemptSummary>('/api/take/submit', input),

  submitComment: (input: { attemptId: string; token: string; body: string }) =>
    post<SubmittedComment>('/api/take/comment', input),

  getReleasedResult: (input: { attemptId: string; token: string }) =>
    post<ReleasedResult>('/api/take/result', input),

  // --- grading -------------------------------------------------------------
  listComments: (testId: string) =>
    request<{ comments: AttemptComment[] }>(`/api/tests/${testId}/comments`),

  scoreWrittenAnswer: (input: {
    attemptId: string;
    questionId: string;
    score: number;
    feedback: RichText | null;
  }) => post<AttemptSummary>('/api/grading/score', input),

  releaseResults: (testId: string) =>
    post<{ released: number; pending: number }>('/api/grading/release', { testId }),
};
