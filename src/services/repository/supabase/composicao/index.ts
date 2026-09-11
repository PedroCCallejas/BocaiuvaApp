/** Compõe todos os módulos de domínio sobre a infraestrutura do Supabase. */

import type { ModuloMigravel } from '@/services/repository/modulos';
import { supabase } from '@/config/supabase/client';
import { authService } from '@/services/auth';
import { comAvaliacoes } from '@/services/repository/supabase/composicao/avaliacoes';
import { comElenco } from '@/services/repository/supabase/composicao/elenco';
import { comFinanceiro } from '@/services/repository/supabase/composicao/financeiro';
import { comNotificacoes } from '@/services/repository/supabase/composicao/notificacoes';
import { comPartidas } from '@/services/repository/supabase/composicao/partidas';
import { comResenhas } from '@/services/repository/supabase/composicao/resenhas';
import {
  aplicarTodasAsFatias,
  fatiasPendentes,
  recarregarTodasAsFatias,
  registrarEmissao,
} from '@/services/repository/supabase/fatias';
import type { AppRepository, AppSnapshot } from '@/services/repository/types';

/**
 * A ordem importa: a camada de cima vence.
 *
 * `elenco` fica por último porque é ela que define o contexto da sessão — se
 * outra camada sobrescrevesse `getSnapshot` depois dela, o app perderia a
 * identidade da pessoa.
 */
const CAMADAS: { modulo: ModuloMigravel; aplicar: (base: AppRepository) => AppRepository }[] = [
  { modulo: 'financeiro', aplicar: comFinanceiro },
  { modulo: 'resenhas', aplicar: comResenhas },
  { modulo: 'partidas', aplicar: comPartidas },
  { modulo: 'avaliacoes', aplicar: comAvaliacoes },
  { modulo: 'elenco', aplicar: comElenco },
  { modulo: 'notificacoes', aplicar: comNotificacoes },
];

export function criarRepositorioSupabase(base: AppRepository): AppRepository {
  const composto = CAMADAS.reduce<AppRepository>(
    (atual, camada) => camada.aplicar(atual),
    base,
  );

  /** Carrega as fatias do Postgres e monta o snapshot único usado pela UI. */
  const comporSobre = async (lerBase: () => Promise<AppSnapshot>) => {
    const [snapshot] = await Promise.all([
      lerBase(),
      Promise.all(fatiasPendentes().map((fatia) => fatia.obter())),
    ]);

    return aplicarTodasAsFatias(snapshot);
  };

  const comSnapshot: AppRepository = {
    ...composto,

    async getInitialSnapshot() {
      const session = authService.getCurrentUser() ?? (await authService.restoreSession());
      if (!session) return await base.getInitialSnapshot();

      return await comporSobre(() => base.getInitialSnapshot());
    },

    async getSnapshot() {
      const session = authService.getCurrentUser() ?? (await authService.restoreSession());
      if (!session) return await base.getSnapshot();

      await recarregarTodasAsFatias();
      return aplicarTodasAsFatias(await base.getSnapshot());
    },
  };

  comSnapshot.subscribeSnapshot = async (currentUserId, handlers) => {
    const client = supabase;

    if (!client) {
      return () => {};
    }

    let encerrado = false;
    let carregando = false;
    let atualizacaoPendente = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const emitirSnapshotAtual = async () => {
      if (encerrado) return;

      if (carregando) {
        atualizacaoPendente = true;
        return;
      }

      carregando = true;

      try {
        const snapshot = await comSnapshot.getSnapshot();

        if (!encerrado) {
          registrarEmissao(snapshot, handlers.onSnapshot);
          handlers.onSnapshot(snapshot);
        }
      } catch (error) {
        if (!encerrado) handlers.onError?.(error);
      } finally {
        carregando = false;

        if (atualizacaoPendente && !encerrado) {
          atualizacaoPendente = false;
          void emitirSnapshotAtual();
        }
      }
    };

    const agendarAtualizacao = () => {
      if (encerrado) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void emitirSnapshotAtual(), 200);
    };

    const canal = client
      .channel(`snapshot:${currentUserId}:${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public' }, agendarAtualizacao)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public' }, agendarAtualizacao);

    const cancelar = () => {
      encerrado = true;
      if (timer) clearTimeout(timer);
      void client.removeChannel(canal);
    };

    return await new Promise<() => void>((resolve, reject) => {
      let conectado = false;

      canal.subscribe((status, error) => {
        if (encerrado) return;

        if (status === 'SUBSCRIBED') {
          conectado = true;
          void emitirSnapshotAtual();
          resolve(cancelar);
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          const motivo = error ?? new Error('A sincronização em tempo real ficou indisponível.');

          if (conectado) {
            handlers.onError?.(motivo);
          } else {
            cancelar();
            reject(motivo);
          }
        }
      });
    });
  };

  return comSnapshot;
}

/** Compatibilidade temporária para testes e imports históricos. */
export const comModulosNoSupabase = criarRepositorioSupabase;
