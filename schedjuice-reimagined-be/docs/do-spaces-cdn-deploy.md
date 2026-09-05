# DigitalOcean Spaces CDN — deployment

Schedjuice uses **one physical DO Space** (`schedjuice-dev`) with **env isolation in object key prefixes** (`schedjuice-prod/...` vs `schedjuice-dev/...`). `S3_BUCKET_NAME` must always be the real Space name, not the env folder name.

## Key layout

```
schedjuice-dev/                          ← physical Space (S3_BUCKET_NAME)
├── schedjuice-prod/
│   ├── media-prod/public/{schema}/...
│   ├── media-prod/private/{schema}/...
│   └── static-prod/
└── schedjuice-dev/
    ├── media-dev/public/{schema}/...
    ├── media-dev/private/{schema}/...
    └── static-dev/
```

## Backend (`schedjuice-reimagined-be`)

### Production

```bash
STORAGE_BACKEND=do
S3_BUCKET_NAME=schedjuice-dev
S3_MEDIA_LOCATION=schedjuice-prod/media-prod
S3_STATIC_LOCATION=schedjuice-prod/static-prod
S3_ENDPOINT=https://sgp1.digitaloceanspaces.com
S3_CDN_DOMAIN=schedjuice-dev.sgp1.cdn.digitaloceanspaces.com
S3_CUSTOM_DOMAIN=https://schedjuice-dev.sgp1.digitaloceanspaces.com
S3_KEY_ID=...
S3_SECRET=...
```

### Development (same Space, different prefix)

```bash
STORAGE_BACKEND=do
S3_BUCKET_NAME=schedjuice-dev
S3_MEDIA_LOCATION=schedjuice-dev/media-dev
S3_STATIC_LOCATION=schedjuice-dev/static-dev
S3_ENDPOINT=https://sgp1.digitaloceanspaces.com
S3_CDN_DOMAIN=schedjuice-dev.sgp1.cdn.digitaloceanspaces.com
S3_CUSTOM_DOMAIN=https://schedjuice-dev.sgp1.digitaloceanspaces.com
```

Do **not** set `S3_BUCKET_NAME=schedjuice-prod` unless a separate `schedjuice-prod` Space exists in DO.

Do **not** wrap Railway values in quotes (e.g. use `schedjuice-dev`, not `"schedjuice-dev"`).

Redeploy the backend service.

## Juice Box

Match the backend physical bucket and composite media paths:

```bash
S3_BUCKET_NAME=schedjuice-dev
S3_MEDIA_LOCATION=schedjuice-prod/media-prod
S3_STATIC_LOCATION=schedjuice-prod/static-prod
S3_ENDPOINT=https://sgp1.digitaloceanspaces.com
S3_CUSTOM_DOMAIN=schedjuice-dev.sgp1.cdn.digitaloceanspaces.com
S3_REGION=sgp1
```

`tusd` `-s3-bucket` must also be `schedjuice-dev`. Set `TUSD_OBJECT_PREFIX` to match `S3_MEDIA_LOCATION` (with trailing slash if required by tusd).

Hostname only for `S3_CUSTOM_DOMAIN` (no `https://`).

Redeploy Juice Box.

## Verify

1. `GET /api/v1/organizations/public` — logo URL uses CDN hostname:
   `https://schedjuice-dev.sgp1.cdn.digitaloceanspaces.com/schedjuice-prod/media-prod/public/{schema}/logos/...`
2. Upload a new public file via Juice Box — stored URL uses CDN hostname
3. Profile image / payment screenshot — presigned private URL uses virtual-hosted shape on the regional endpoint (not bucket-origin + virtual, which doubles the hostname):
   `https://schedjuice-dev.sgp1.digitaloceanspaces.com/schedjuice-prod/media-prod/private/{schema}/...` (no `.cdn.`, no `schedjuice-dev.schedjuice-dev.`). Returns HTTP 200.
4. Repeat fetch of a public CDN URL — check for cache hit headers (`x-cache: HIT`)

## Legacy objects

Older prod files may live at `media-prod/private/...` at the Space root (without the `schedjuice-prod/` prefix). The backend resolves these via key fallbacks when presigning.

## Optional backfill

Legacy Juice Box rows with full origin URLs in `public_data` still work. To move them to CDN:

```sql
UPDATE app_attachment_attachment
SET public_data = REPLACE(public_data, '.sgp1.digitaloceanspaces.com', '.sgp1.cdn.digitaloceanspaces.com')
WHERE public_data LIKE '%.sgp1.digitaloceanspaces.com%'
  AND public_data NOT LIKE '%.cdn.digitaloceanspaces.com%';
```

Run per tenant schema if needed.
