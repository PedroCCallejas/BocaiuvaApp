import { supabase } from '@/config/supabase/client';
import { todasAsLinhas } from '@/services/repository/supabase/paginacao';
import { cashWeekStart, type TeamCashEntry } from '@/lib/team-cash';

function client() {
  if (!supabase) throw new Error('A conexão com o caixa não está configurada.');
  return supabase;
}

export async function readTeamCash(teamId: string): Promise<TeamCashEntry[]> {
  const { data, error } = await todasAsLinhas<TeamCashEntry, { message: string }>(async (from, to) => {
    const response = await client().rpc('listar_caixa_do_time', { p_team_id: teamId })
      .select('id,team_id,week_start,amount_cents,description')
      .order('week_start', { ascending: false }).order('id').range(from, to);
    if (response.error) return { data: null, error: response.error };
    const rows: unknown = response.data;
    if (!Array.isArray(rows)) return { data: null, error: { message: 'Resposta inválida do caixa.' } };
    return { data: rows as TeamCashEntry[], error: null };
  });
  if (error) throw new Error('Não foi possível carregar o caixa. Tente novamente; se persistir, fale com o administrador.');
  return data ?? [];
}

export async function saveTeamCash(input: {
  id?: string; teamId: string; date: string; amountCents: number; description: string;
}): Promise<void> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 2147483647)
    throw new Error('Valor inválido.');
  const description = input.description.trim();
  if (description.length > 240) throw new Error('A descrição deve ter até 240 caracteres.');
  const values = { week_start: cashWeekStart(input.date), amount_cents: input.amountCents, description: description || null };
  const query = input.id
    ? client().from('team_cash_entries').update(values).eq('id', input.id).eq('team_id', input.teamId)
    : client().from('team_cash_entries').insert({ ...values, team_id: input.teamId });
  const { data, error } = await query.select('id').single();
  if (error?.code === '23505') throw new Error('Esta semana já foi registrada. Atualize a lista e use Corrigir nesse lançamento.');
  if (error || !data) throw new Error('Não foi possível confirmar o registro. Atualize a lista antes de tentar novamente.');
}
