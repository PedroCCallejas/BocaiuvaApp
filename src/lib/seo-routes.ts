export function isIndexablePublicRoute(segments: string[]) {
  if (segments.includes('(app)') || segments.includes('(auth)')) return false;
  if (segments.length === 0) return true;

  return ['teams-gallery', 'teams', 'ferramentas', 'privacidade', 'termos', 'suporte'].includes(
    segments[0] ?? '',
  );
}
