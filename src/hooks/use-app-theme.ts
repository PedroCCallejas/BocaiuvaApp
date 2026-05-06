import { createTeamTheme } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';
import { selectCurrentTeam } from '@/store/selectors';

export function useAppTheme() {
  const team = useAppStore(selectCurrentTeam);
  return createTeamTheme(team);
}
