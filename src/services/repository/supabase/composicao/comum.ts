/**
 * O que toda camada de composição precisa.
 *
 * Separado quando o quarto módulo chegou: com financeiro, resenhas, partidas e
 * elenco no mesmo arquivo, ninguém mais conseguiria ler.
 */

import { supabase } from '@/config/supabase/client';
import {
  criarErroDoRepositorio,
  traduzirErroDoPostgres,
} from '@/services/repository/supabase/erros';

/**
 * Time ativo da pessoa autenticada.
 *
 * Vem do banco, não de estado guardado em módulo. Guardar numa variável criaria
 * uma segunda fonte da verdade que sai de sincronia quando a pessoa troca de
 * time — e o sintoma seria dado gravado no time errado.
 */
export async function buscarTimeAtivo(): Promise<string | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select('active_team_id')
    .maybeSingle();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível identificar seu time agora.');
  }

  const id = (data as { active_team_id?: unknown } | null)?.active_team_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export async function exigirTimeAtivo(): Promise<string> {
  const teamId = await buscarTimeAtivo();

  if (!teamId) {
    throw criarErroDoRepositorio('Escolha um time antes de continuar.', 'failed-precondition');
  }

  return teamId;
}
