/**
 * Notificações do time no Postgres.
 *
 * Último módulo a sair do Firestore, e o que fechou a migração — não por ser o
 * mais difícil, mas por ter passado despercebido: com `partidas` no Postgres e
 * `notificacoes` no Firestore, encerrar um jogo deixou de gerar aviso nenhum. A
 * partida era gravada num banco e o aviso, no outro, que não conhecia a partida.
 *
 * Ninguém notou por dias porque não dá erro: simplesmente não aparece nada.
 *
 * Marcar como lida vai por RPC porque é um `array_append` sobre
 * `read_by_user_ids`. Feito por leitura e reescrita do array, duas pessoas
 * marcando ao mesmo tempo apagariam uma à outra.
 */

import { supabase } from '@/config/supabase/client';
import {
  criarErroDoRepositorio,
  traduzirErroDoPostgres,
} from '@/services/repository/supabase/erros';
import { todasAsLinhas } from '@/services/repository/supabase/paginacao';
import type { AppNotification, NotificationType } from '@/types/domain';

function cliente() {
  if (!supabase) {
    throw criarErroDoRepositorio(
      'A conexão com o banco não está configurada.',
      'failed-precondition',
    );
  }

  return supabase;
}

function texto(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' && valor.length > 0 ? valor : padrao;
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : null;
}

export function paraNotificacao(linha: Record<string, unknown>): AppNotification {
  const agora = new Date().toISOString();

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    type: texto(linha.type, 'match-updated') as NotificationType,
    title: texto(linha.title),
    message: texto(linha.message),
    matchId: textoOuNulo(linha.match_id),
    playerId: textoOuNulo(linha.player_id),
    entryId: textoOuNulo(linha.entry_id),
    actorUserId: textoOuNulo(linha.actor_user_id),
    targetUserId: textoOuNulo(linha.target_user_id),
    readByUserIds: Array.isArray(linha.read_by_user_ids)
      ? (linha.read_by_user_ids as string[])
      : [],
    createdAt: texto(linha.created_at, agora),
    updatedAt: texto(linha.updated_at, agora),
  };
}

export async function buscarNotificacoes(teamId: string): Promise<AppNotification[]> {
  const supabaseClient = cliente();

  // A policy já esconde o que é de outra pessoa (`target_user_id`), então aqui
  // não há filtro de destinatário a repetir.
  const { data, error } = await todasAsLinhas((de, ate) =>
    supabaseClient
      .from('notifications')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(de, ate),
  );

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar os avisos agora.');
  }

  return (data ?? []).map(paraNotificacao);
}

/**
 * Grava os avisos de uma vez.
 *
 * `upsert` por id porque os ids são estáveis por evento (`match-finished` de
 * uma partida é sempre o mesmo). Reencerrar a partida atualiza o aviso em vez
 * de criar um segundo igual.
 */
export async function salvarNotificacoes(
  notificacoes: AppNotification[],
): Promise<void> {
  if (notificacoes.length === 0) {
    return;
  }

  const { error } = await cliente()
    .from('notifications')
    .upsert(
      notificacoes.map((item) => ({
        id: item.id,
        team_id: item.teamId,
        type: item.type,
        title: item.title,
        message: item.message,
        match_id: item.matchId ?? null,
        player_id: item.playerId ?? null,
        entry_id: item.entryId ?? null,
        actor_user_id: item.actorUserId ?? null,
        target_user_id: item.targetUserId ?? null,
        read_by_user_ids: item.readByUserIds ?? [],
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      })),
      { onConflict: 'id' },
    );

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível registrar os avisos agora.');
  }
}

export async function marcarNotificacaoComoLida(notificationId: string): Promise<void> {
  const { error } = await cliente().rpc('marcar_notificacao_lida', {
    p_notification_id: notificationId,
  });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível marcar o aviso como lido.');
  }
}

export async function marcarTodasComoLidas(teamId: string): Promise<void> {
  const { error } = await cliente().rpc('marcar_notificacoes_lidas', {
    p_team_id: teamId,
  });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível marcar os avisos como lidos.');
  }
}
