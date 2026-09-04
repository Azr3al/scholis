/**
 * Where uploaded files live.
 *
 * Same shape of boundary as `lib/mail`: an interface here, one adapter per
 * provider, and a single place that chooses. Nothing outside this directory
 * learns whether a file is on a Railway volume or in a bucket — question
 * bodies hold a key and a URL, never a provider detail.
 *
 * The surface is the intersection of what a filesystem and an object store can
 * both do. No listing, no directories, no move: including a capability only one
 * of them has is how the abstraction ends up leaking the day S3 arrives.
 *
 * `get` earns its place even though S3 could be fetched directly by the
 * browser. A Railway volume is attached to the API process and is not
 * reachable any other way, so the serving route has to read through this. With
 * `get` in the interface that route is provider-agnostic; without it, it would
 * have to branch on the provider, which is the thing this boundary exists to
 * prevent.
 */
export interface StoredObject {
  body: Uint8Array;
  contentType: string;
}

export interface StoragePutInput {
  /** Provider-independent path. Validated by the caller, never user-supplied raw. */
  key: string;
  body: Uint8Array;
  contentType: string;
}

export interface Storage {
  put: (input: StoragePutInput) => Promise<void>;
  get: (key: string) => Promise<StoredObject | null>;
  /** Where a browser should fetch this key from. */
  url: (key: string) => string;
}
