import { getDb, requireEnv } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import type {
  Actor,
  AuthedContext,
  PlatformContext,
  PublicContext,
} from '@/server/context.types';
import { forbidden } from '@/server/errors';
import { randomUUID } from 'node:crypto';

// Where HTTP meets the services. Services never see a Request, routes never see
// a database.
//
// Under app/api/_lib rather than server/http — the layering table puts HTTP in
// app/api, and anything under server/<dir>/ counts as a use case to the
// no-service-to-service guard. Next ignores _ folders for routing.

const base = () => ({
  db: getDb(),
  now: () => new Date(),
  newId: () => randomUUID(),
  attemptTokenSecret: requireEnv('ATTEMPT_TOKEN_SECRET'),
  storage: getStorage(),
});

export const publicContextFor = (): PublicContext => base();

// actor comes from the session and the DB row behind it, never a header or the
// request body. orgId especially — it's assigned at provisioning time.
export const authedContextFor = (actor: Actor | null): AuthedContext => {
  if (actor === null) throw forbidden('You must be signed in to do this.');
  return { ...base(), actor };
};

// The integrating system itself, above any one school. Carries no orgId, so it
// cannot be handed to a service that expects one — the mistake does not
// typecheck rather than being caught in review.
export const platformContextFor = (platform: { clientId: string } | null): PlatformContext => {
  if (platform === null) throw forbidden('A platform credential is required to do this.');
  return { ...base(), platform };
};
