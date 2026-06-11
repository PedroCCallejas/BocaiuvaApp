export function appendCacheBustParam(
  url: string,
  cacheBustKey?: string | number | null,
) {
  const normalizedUrl = url.trim();

  if (!normalizedUrl || cacheBustKey == null || cacheBustKey === '') {
    return normalizedUrl;
  }

  const serializedKey = String(cacheBustKey);

  try {
    const parsedUrl = new URL(normalizedUrl);
    parsedUrl.searchParams.set('v', serializedKey);
    return parsedUrl.toString();
  } catch {
    const separator = normalizedUrl.includes('?') ? '&' : '?';
    return `${normalizedUrl}${separator}v=${encodeURIComponent(serializedKey)}`;
  }
}
