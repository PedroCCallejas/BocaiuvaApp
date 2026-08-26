/**
 * Guarda e usa a inscrição de Web Push.
 *
 * Duas responsabilidades, ambas finas: salvar a inscrição deste navegador no
 * Postgres, e pedir para a Edge Function avisar o time.
 *
 * O envio não sai daqui de propósito. A policy `users_select_self` só deixa cada
 * conta ler a própria linha, então o celular do admin não consegue ler as
 * inscrições dos outros. Quem envia é a função no servidor; este arquivo só
 * bate na porta dela.
 */

import { supabase } from '@/config/supabase/client';
import {
  assinarPush,
  cancelarPush,
  inscricaoAtual,
  motivoDeIndisponibilidade,
  type InscricaoDePush,
  type MotivoSemPush,
} from '@/services/notifications/web-push';

/**
 * Chave pública VAPID.
 *
 * É pública mesmo: vive no bundle e identifica o remetente para o navegador.
 * Quem assina é a privada, que fica só nos secrets do Supabase.
 */
const CHAVE_PUBLICA = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? '';

export function pushConfigurado(): boolean {
  return CHAVE_PUBLICA.length > 0 && Boolean(supabase);
}

async function salvarInscricao(userId: string, inscricao: InscricaoDePush): Promise<void> {
  if (!supabase) {
    return;
  }

  const agora = new Date().toISOString();

  // `onConflict: endpoint` porque o mesmo navegador reaproveita o endpoint: sem
  // isso, cada abertura do app criaria uma linha nova e a pessoa receberia o
  // mesmo aviso várias vezes.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: inscricao.endpoint,
      user_id: userId,
      p256dh: inscricao.p256dh,
      auth: inscricao.auth,
      user_agent:
        typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      updated_at: agora,
    },
    { onConflict: 'endpoint' },
  );

  if (error && typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn('[push] nao salvou a inscricao', error);
  }
}

/**
 * Liga os avisos neste navegador.
 *
 * **Chame a partir de um toque.** O Safari exige gesto da pessoa para pedir
 * permissão; no carregamento da tela, o pedido é recusado em silêncio.
 */
export async function ativarPush(
  userId: string,
): Promise<{ ok: true } | { ok: false; motivo: MotivoSemPush }> {
  if (!pushConfigurado()) {
    return { ok: false, motivo: 'sem-suporte' };
  }

  const resultado = await assinarPush(CHAVE_PUBLICA);

  if (!resultado.ok) {
    return resultado;
  }

  await salvarInscricao(userId, resultado.inscricao);
  return { ok: true };
}

/**
 * Reconfere a inscrição a cada abertura.
 *
 * O navegador troca o endpoint sozinho quando quer, sem avisar. Salvar só uma
 * vez na ativação faria a pessoa parar de receber sem ninguém perceber — e o
 * sintoma seria "o push não funciona para o fulano", meses depois.
 *
 * Não pede permissão: se ainda não foi concedida, sai quieto.
 */
export async function sincronizarPush(userId: string): Promise<void> {
  if (!pushConfigurado() || motivoDeIndisponibilidade()) {
    return;
  }

  const inscricao = await inscricaoAtual();

  if (inscricao) {
    await salvarInscricao(userId, inscricao);
  }
}

/** Desliga neste navegador e apaga do banco. */
export async function desativarPush(): Promise<void> {
  const endpoint = await cancelarPush();

  if (endpoint && supabase) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }
}

export interface AvisoParaOTime {
  teamId: string;
  title: string;
  body: string;
  /** Para onde levar ao tocar. Caminho interno, ex: `/matches/abc`. */
  url?: string;
  /** Agrupa avisos do mesmo assunto numa notificação só. */
  tag?: string;
  /** Quem disparou não recebe o próprio aviso. */
  excluirUserId?: string;
}

/**
 * Pede para a Edge Function avisar o time.
 *
 * Best-effort de propósito: publicar a escalação não pode falhar porque o aviso
 * falhou. O mesmo critério das notificações internas.
 */
export async function avisarTime(aviso: AvisoParaOTime): Promise<void> {
  if (!supabase) {
    return;
  }

  try {
    const { error } = await supabase.functions.invoke('enviar-push', { body: aviso });

    if (error && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[push] envio falhou', error);
    }
  } catch (erro) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[push] envio falhou', erro);
    }
  }
}
