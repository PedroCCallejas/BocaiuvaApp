import { usePathname } from 'expo-router';

import type { AdPlacement } from '@/constants/ads';
import { AppAdBanner } from '@/components/ads/AppAdBanner';

// Allowlist: anúncio APENAS nas rotas listadas aqui.
// Qualquer outra rota, incluindo login, home, perfil, rotas protegidas, retorna null.
const ALLOWED_ROUTES = [
  '/ferramentas',
  '/ferramentas/sorteador-de-times',
  '/ferramentas/cronometro-pelada',
  '/ferramentas/rodizio-de-times',
  '/ferramentas/campeonato-rapido',
];

interface SafeAdProps {
  placement: AdPlacement;
  compact?: boolean;
  hasContent?: boolean;
}

export function SafeAd({ placement, compact = false, hasContent = true }: SafeAdProps) {
  const pathname = usePathname();

  const isAllowed = ALLOWED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (!isAllowed || !hasContent) {
    return null;
  }

  return <AppAdBanner placement={placement} compact={compact} />;
}
