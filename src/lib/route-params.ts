export function isLiteralRouteParam(value: string | undefined): boolean {
  if (!value) return false;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }

  return /^\[[a-z][a-z\d]*Id\]$/i.test(decoded.trim());
}
