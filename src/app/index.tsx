import { Redirect } from 'expo-router';

import { useAppStore } from '@/store/app-store';
import { selectCurrentTeam, selectCurrentUser } from '@/store/selectors';

export default function IndexScreen() {
  const user = useAppStore(selectCurrentUser);
  const team = useAppStore(selectCurrentTeam);

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!team) {
    return <Redirect href={'/team-access' as never} />;
  }

  return <Redirect href="/home" />;
}
