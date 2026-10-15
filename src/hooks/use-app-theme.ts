import { createTeamTheme } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';
import { selectCurrentTeam } from '@/store/selectors';
import { usePathname } from 'expo-router';

export function useAppTheme() {
  const team = useAppStore(selectCurrentTeam);
  const pathname = usePathname();
  const productRoute = ['/', '/login', '/register', '/forgot-password', '/teams-gallery', '/privacidade', '/termos', '/suporte'].includes(pathname)
    || pathname.startsWith('/ferramentas') || pathname.startsWith('/teams/');
  return createTeamTheme(productRoute ? null : team);
}
