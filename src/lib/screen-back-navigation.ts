/** Destinos internos para abrir uma tela diretamente, sem historico do app. */
export function getScreenBackFallback(pathname: string, hasTeam: boolean): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const [section, id] = parts;
  if (section === 'players' || section === 'matches') {
    if (!id) return null; // Abas principais nao sao telas de detalhe.
    return parts.length > 2 ? `/${section}/${id}` : `/${section}`;
  }
  if (section === 'lineup') return id ? `/matches/${id}` : '/matches';
  if (section === 'teams' && id) return '/teams-gallery';
  if (section === 'team-invite' || section === 'team-rating-criteria') return '/team-settings';
  if (section === 'team-setup') return '/team-access';
  if (['account', 'notifications', 'team-settings', 'caixa'].includes(section)) {
    return hasTeam ? '/home' : '/team-access';
  }
  if (section === 'teams-gallery') return hasTeam ? '/home' : '/';
  return null;
}

/** Nao usa history.length: ele pode incluir paginas externas ao aplicativo. */
export function navigateScreenBack(
  navigation: { canGoBack: () => boolean; back: () => void; replace: (href: never) => void },
  fallback: string,
) {
  if (navigation.canGoBack()) navigation.back();
  else navigation.replace(fallback as never);
}
