import { useEffect, useState } from 'react';
import { Redirect, Stack, usePathname } from 'expo-router';
import { LoadingState } from '@/components/ui/LoadingState';
import { useAppStore } from '@/store/app-store';
import { selectCurrentUser } from '@/store/selectors';
import { scopePickupToolsToAccount } from '@/store/pickup-tools-store';
import { getSafeReturnPath } from '@/lib/navigation';

export default function ToolsLayout() {
  const ready = useAppStore(state => state.ready);
  const user = useAppStore(selectCurrentUser);
  const pathname = usePathname();
  const [requestedPath] = useState(() => getSafeReturnPath(typeof window === 'undefined' ? pathname : window.location.pathname));
  const userId = user?.id ?? null;
  const [scopedUser, setScopedUser] = useState<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    scopePickupToolsToAccount(userId);
    setScopedUser(userId);
  }, [ready, userId]);
  if (!ready) return <LoadingState />;
  if (!user) {
    const currentPath = getSafeReturnPath(typeof window === 'undefined' ? pathname : window.location.pathname);
    const destination = currentPath === '/ferramentas' ? requestedPath : currentPath;
    return <Redirect href={{ pathname: '/login', params: { next: destination } }} />;
  }
  if (scopedUser !== user.id) return <LoadingState title="Preparando as ferramentas…" description="Carregando a pelada desta conta." />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
