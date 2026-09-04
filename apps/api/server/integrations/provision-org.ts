import {
  findOrgByExternalRef,
  findOrgBySlug,
  insertOrganization,
} from '@/data/organizations';
import { insertApiClient, insertApiClientSecret, listApiClientsForOrg } from '@/data/api-clients';
import { mintCredential } from '@/server/api-credential';
import type { PlatformContext } from '@/server/context.types';
import { validationFailed } from '@/server/errors';
import { ORG_SCOPES } from '@scholis/schema';
import { z } from 'zod';

/**
 * Give an integrating system's tenant a Scholis organisation, and a key for it.
 *
 * This is the only place a machine may create an organisation, and it is why
 * the platform tier exists at all. The credential that calls this holds no
 * scope that reads a paper or a mark — it can bring schools into being and
 * nothing else.
 *
 * Idempotent on `externalRef`. A caller that times out and retries must get
 * back the school it already made; creating a second one would split a school
 * in half, with some papers in each and no way to tell which is real.
 */

export const provisionOrgInput = z.object({
  /** The caller's own identifier for this school. Its tenant key, usually. */
  externalRef: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
});

export type ProvisionOrgInput = z.infer<typeof provisionOrgInput>;

export interface ProvisionedOrg {
  orgId: string;
  name: string;
  externalRef: string;
  /** True when this call created it, false when it already existed. */
  created: boolean;
  /**
   * The organisation's own key, returned only on the call that created it.
   *
   * A retry gets `null` rather than a fresh secret. Minting one on every call
   * would mean a caller with a network problem silently accumulating live
   * credentials it never recorded.
   */
  key: { keyId: string; token: string } | null;
}

/** Readable, unique, and derived from nothing secret. */
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'school';

export const provisionOrg = async (
  ctx: PlatformContext,
  input: ProvisionOrgInput,
): Promise<ProvisionedOrg> => {
  const existing = await findOrgByExternalRef(ctx.db, input.externalRef);
  if (existing !== null) {
    // Deliberately not re-minting. The caller either recorded the key from the
    // first call or needs a human to rotate it — quietly handing out another
    // would leave live secrets nobody is tracking.
    const clients = await listApiClientsForOrg(ctx.db, existing.id);
    if (clients.length === 0) {
      throw validationFailed(
        'That school exists but has no API key. Create one from the dashboard.',
      );
    }

    return {
      orgId: existing.id,
      name: existing.name,
      externalRef: input.externalRef,
      created: false,
      key: null,
    };
  }

  // Two schools called "St Mary's" is not a mistake, so a taken slug takes a
  // suffix rather than failing a caller who cannot do anything about it.
  const base = slugify(input.name);
  let slug = base;
  for (let attempt = 1; (await findOrgBySlug(ctx.db, slug)) !== null; attempt += 1) {
    slug = `${base}-${String(attempt)}`;
    if (attempt > 50) throw validationFailed('Could not create a school with that name.');
  }

  const credential = mintCredential();

  return ctx.db.transaction(async (tx) => {
    const org = await insertOrganization(tx, {
      name: input.name,
      slug,
      externalRef: input.externalRef,
    });

    const client = await insertApiClient(tx, {
      kind: 'org',
      orgId: org.id,
      name: `${input.name} (provisioned)`,
      keyId: credential.keyId,
      // Everything an org key may hold. Narrowing it here would mean the
      // caller cannot author a paper it just provisioned a school for.
      scopes: [...ORG_SCOPES],
      // No person did this, and saying so honestly is the point of the column
      // being nullable.
      createdBy: null,
      expiresAt: null,
    });

    await insertApiClientSecret(tx, {
      clientId: client.id,
      secretHash: credential.secretHash,
    });

    return {
      orgId: org.id,
      name: org.name,
      externalRef: input.externalRef,
      created: true,
      key: { keyId: client.keyId, token: credential.token },
    };
  });
};
