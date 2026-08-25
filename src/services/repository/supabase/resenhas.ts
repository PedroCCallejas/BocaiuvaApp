/**
 * Resenhas da partida no Postgres.
 *
 * Segundo módulo a sair do Firestore. Escolhido por ser o mais isolado que
 * restou: três escritores, nenhum acoplamento com outra coleção. Serve para
 * confirmar que o padrão do financeiro se repete num módulo de conteúdo, e não
 * de dinheiro.
 *
 * O que continua no Firestore: a **notificação** do time. Ela é efeito
 * colateral e já era best-effort — publicar a resenha não pode falhar porque o
 * aviso falhou.
 */

import { supabase } from '@/config/supabase/client';
import { resolveDiaryEmoji, validateDiaryFields } from '@/lib/match-diary';
import { paraResenha } from '@/lib/migracao/mapear-dominio';
import {
  criarErroDoRepositorio,
  traduzirErroDoPostgres,
} from '@/services/repository/supabase/erros';
import type {
  CreateMatchDiaryEntryInput,
  UpdateMatchDiaryEntryInput,
} from '@/services/repository/types';
import type { MatchDiaryEntry } from '@/types/domain';

function cliente() {
  if (!supabase) {
    throw criarErroDoRepositorio(
      'A conexão com o banco não está configurada.',
      'failed-precondition',
    );
  }

  return supabase;
}

function agora() {
  return new Date().toISOString();
}

/** Id no mesmo formato do Firestore, para os dois bancos conviverem. */
function novoId() {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';

  for (let i = 0; i < 20; i += 1) {
    id += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }

  return id;
}

function texto(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' && valor.length > 0 ? valor : padrao;
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : null;
}

export async function buscarResenhas(teamId: string): Promise<MatchDiaryEntry[]> {
  const { data, error } = await cliente()
    .from('match_diary_entries')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar as resenhas agora.');
  }

  return (data ?? []).map(paraResenha);
}

/**
 * Resenhas de uma partida.
 *
 * A tela da partida pede só as dela em vez de filtrar o snapshot inteiro. A RLS
 * já limita ao time, então não há filtro de permissão a repetir aqui.
 */
export async function buscarResenhasDaPartida(matchId: string): Promise<MatchDiaryEntry[]> {
  const { data, error } = await cliente()
    .from('match_diary_entries')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar as resenhas agora.');
  }

  return (data ?? []).map(paraResenha);
}

/** As mais recentes do time, para a lista da home. */
export async function buscarResenhasDoTime(
  teamId: string,
  limite?: number,
): Promise<MatchDiaryEntry[]> {
  let consulta = cliente()
    .from('match_diary_entries')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (limite && limite > 0) {
    consulta = consulta.limit(limite);
  }

  const { data, error } = await consulta;

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar as resenhas agora.');
  }

  return (data ?? []).map(paraResenha);
}

/**
 * Quem está escrevendo.
 *
 * Nome e id vêm do banco, não do cliente. O `authorName` é uma cópia
 * denormalizada — vive na resenha para o histórico não mudar quando a pessoa
 * troca o nome depois.
 */
async function autorAtual(): Promise<{ id: string; nome: string }> {
  const { data, error } = await cliente()
    .from('users')
    .select('id, display_name')
    .maybeSingle();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível identificar você agora.');
  }

  const id = textoOuNulo((data as { id?: unknown } | null)?.id);

  if (!id) {
    throw criarErroDoRepositorio('Sessão expirada.', 'permission-denied');
  }

  return {
    id,
    nome: texto((data as { display_name?: unknown }).display_name, 'Alguém do time'),
  };
}

/**
 * Só menciona quem existe no time.
 *
 * Id de jogador apagado, ou de outro time, viraria menção quebrada na tela. A
 * RLS já impediria a leitura de outro time; este filtro evita gravar a
 * referência inútil de saída.
 */
async function sanitizarMencionados(
  teamId: string,
  mencionados: string[] = [],
): Promise<string[]> {
  const pedidos = [...new Set(mencionados.filter(Boolean))];

  if (pedidos.length === 0) {
    return [];
  }

  const { data, error } = await cliente()
    .from('players')
    .select('id')
    .eq('team_id', teamId)
    .in('id', pedidos);

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível validar as menções agora.');
  }

  const existentes = new Set(
    (data ?? [])
      .map((linha) => textoOuNulo((linha as { id?: unknown }).id))
      .filter((id): id is string => Boolean(id)),
  );

  // Mantém a ordem que o autor escolheu.
  return pedidos.filter((id) => existentes.has(id));
}

async function buscarResenhaPorId(entryId: string): Promise<MatchDiaryEntry> {
  const { data, error } = await cliente()
    .from('match_diary_entries')
    .select('*')
    .eq('id', entryId)
    .maybeSingle();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar a resenha agora.');
  }

  if (!data) {
    throw criarErroDoRepositorio('Resenha não encontrada.', 'not-found');
  }

  return paraResenha(data);
}

export async function criarResenha(
  teamId: string,
  input: CreateMatchDiaryEntryInput,
): Promise<MatchDiaryEntry> {
  // Mesma validação do Firestore: título e conteúdo com limites e sem vazio.
  const validado = validateDiaryFields({ title: input.title, content: input.content });
  const autor = await autorAtual();
  const mencionados = await sanitizarMencionados(teamId, input.mentionedPlayerIds);
  const instanteAtual = agora();

  const { data, error } = await cliente()
    .from('match_diary_entries')
    .insert({
      id: novoId(),
      team_id: teamId,
      match_id: input.matchId,
      author_user_id: autor.id,
      author_name: autor.nome,
      title: validado.title,
      content: validado.content,
      mentioned_player_ids: mencionados,
      visibility: 'team',
      pinned: input.pinned ?? false,
      mood: input.mood ?? null,
      emoji: resolveDiaryEmoji(input.mood, input.emoji),
      created_at: instanteAtual,
      updated_at: instanteAtual,
    })
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível publicar a resenha agora.');
  }

  return paraResenha(data);
}

export async function atualizarResenha(
  entryId: string,
  input: UpdateMatchDiaryEntryInput,
): Promise<MatchDiaryEntry> {
  const atual = await buscarResenhaPorId(entryId);
  const validado = validateDiaryFields({
    title: input.title !== undefined ? input.title : atual.title,
    content: input.content !== undefined ? input.content : atual.content,
  });

  const mencionados =
    input.mentionedPlayerIds !== undefined
      ? await sanitizarMencionados(atual.teamId, input.mentionedPlayerIds)
      : atual.mentionedPlayerIds;

  const humor = input.mood !== undefined ? input.mood : atual.mood;

  const { data, error } = await cliente()
    .from('match_diary_entries')
    .update({
      title: validado.title,
      content: validado.content,
      mentioned_player_ids: mencionados,
      pinned: input.pinned !== undefined ? input.pinned : atual.pinned,
      mood: humor,
      // O emoji acompanha o humor quando o autor não escolheu um.
      emoji: resolveDiaryEmoji(humor, input.emoji !== undefined ? input.emoji : atual.emoji),
      updated_at: agora(),
      // `author_user_id` e `author_name` ficam de fora: editar não muda quem
      // escreveu. Deixá-los aqui permitiria assumir a autoria de outra pessoa.
    })
    .eq('id', entryId)
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível salvar a resenha agora.');
  }

  return paraResenha(data);
}

/**
 * Apaga de vez.
 *
 * Diferente de despesa e partida, resenha não tem soft delete: é texto do
 * time, sem consequência contábil ou estatística. Manter escondido seria
 * guardar algo que a pessoa pediu para tirar do ar.
 */
export async function apagarResenha(entryId: string): Promise<void> {
  const { error } = await cliente()
    .from('match_diary_entries')
    .delete()
    .eq('id', entryId);

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível apagar a resenha agora.');
  }
}
