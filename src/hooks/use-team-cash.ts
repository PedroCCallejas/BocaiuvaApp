import { useCallback, useEffect, useRef, useState } from 'react';
import { readTeamCash } from '@/services/repository/supabase/caixa';
import type { TeamCashEntry } from '@/lib/team-cash';

export function useTeamCash(teamId: string, userId: string) {
  const [state, setState] = useState<{ key: string; entries: TeamCashEntry[]; loading: boolean; error: string | null }>({
    key: '', entries: [], loading: true, error: null,
  });
  const key = userId + ':' + teamId;
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setState({ key, entries: [], loading: true, error: null });
    try {
      const entries = await readTeamCash(teamId);
      if (request === generation.current) setState({ key, entries, loading: false, error: null });
    } catch (error) {
      if (request === generation.current) setState({ key, entries: [], loading: false,
        error: error instanceof Error ? error.message : 'Não foi possível carregar o caixa.' });
    }
  }, [teamId, key]);
  useEffect(() => {
    void reload();
    return () => { generation.current += 1; };
  }, [reload]);
  return { ...(state.key === key ? state : { entries: [], loading: true, error: null }), reload };
}
