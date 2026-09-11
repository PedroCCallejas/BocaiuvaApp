import type { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_REFERENCE_PREFIX = 'supabase-storage://';
const PRIVATE_MEDIA_BUCKETS = new Set(['player-photos', 'player-videos']);
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface StorageReference {
  bucket: string;
  path: string;
}

export function isPrivateMediaBucket(bucket: string) {
  return PRIVATE_MEDIA_BUCKETS.has(bucket);
}

export function createStorageReference(bucket: string, path: string) {
  return `${STORAGE_REFERENCE_PREFIX}${bucket}/${path}`;
}

export function parseStorageReference(value?: string | null): StorageReference | null {
  const normalized = value?.trim() ?? '';

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith(STORAGE_REFERENCE_PREFIX)) {
    const remainder = normalized
      .slice(STORAGE_REFERENCE_PREFIX.length)
      .split(/[?#]/, 1)[0];
    const [bucket, ...pathParts] = remainder.split('/').filter(Boolean);
    const path = pathParts.join('/');

    return bucket && path ? { bucket, path } : null;
  }

  try {
    const url = new URL(normalized);
    const marker = '/storage/v1/object/';
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex < 0) {
      return null;
    }

    const storagePath = url.pathname.slice(markerIndex + marker.length);
    const parts = storagePath.split('/').filter(Boolean);

    if (parts[0] === 'public' || parts[0] === 'sign' || parts[0] === 'authenticated') {
      parts.shift();
    }

    const bucket = parts.shift();
    const path = parts.map((part) => decodeURIComponent(part)).join('/');
    return bucket && path ? { bucket, path } : null;
  } catch {
    return null;
  }
}

/**
 * Converte URLs assinadas ou públicas antigas para a referência persistente.
 * URLs externas continuam intactas.
 */
export function canonicalizeStorageUrl(value?: string | null) {
  const reference = parseStorageReference(value);
  return reference ? createStorageReference(reference.bucket, reference.path) : value ?? null;
}

export async function signStorageReferences(
  client: SupabaseClient,
  values: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const references = values
    .map((value) => ({ value: value?.trim() ?? '', reference: parseStorageReference(value) }))
    .filter(
      (item): item is { value: string; reference: StorageReference } =>
        Boolean(item.value && item.reference && isPrivateMediaBucket(item.reference.bucket)),
    );
  const signedByReference = new Map<string, string>();
  const byBucket = new Map<string, Set<string>>();

  for (const { reference } of references) {
    const paths = byBucket.get(reference.bucket) ?? new Set<string>();
    paths.add(reference.path);
    byBucket.set(reference.bucket, paths);
  }

  for (const [bucket, pathSet] of byBucket) {
    const paths = [...pathSet];
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

    if (error) {
      continue;
    }

    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        signedByReference.set(createStorageReference(bucket, item.path), item.signedUrl);
      }
    }
  }

  const result = new Map<string, string>();

  for (const { value, reference } of references) {
    const canonical = createStorageReference(reference.bucket, reference.path);
    const signed = signedByReference.get(canonical);

    if (signed) {
      result.set(value, signed);
      result.set(canonical, signed);
    }
  }

  return result;
}

export function resolveSignedStorageUrl(
  value: string | null | undefined,
  signedUrls: Map<string, string>,
) {
  const normalized = value?.trim() ?? '';

  if (!normalized) {
    return null;
  }

  const reference = parseStorageReference(normalized);

  if (!reference || !isPrivateMediaBucket(reference.bucket)) {
    return normalized;
  }

  const signedUrl =
    signedUrls.get(normalized) ??
    signedUrls.get(createStorageReference(reference.bucket, reference.path));

  if (signedUrl) {
    return signedUrl;
  }

  // Durante a virada dos buckets publicos para privados, os registros antigos
  // ainda guardam URLs publicas validas. Se a assinatura falhar antes de as
  // novas policies entrarem, preserve essa URL em vez de esconder a midia.
  return normalized.includes('/storage/v1/object/public/') ? normalized : null;
}
