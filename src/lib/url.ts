const allowedProtocols = new Set(['http:', 'https:', 'waze:', 'geo:']);

export function isValidExternalUrl(value?: string | null) {
  if (!value?.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value.trim());
    return allowedProtocols.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function normalizeOptionalUrl(value?: string | null) {
  const normalized = value?.trim() ?? '';

  if (!normalized) {
    return null;
  }

  return isValidExternalUrl(normalized) ? normalized : null;
}
