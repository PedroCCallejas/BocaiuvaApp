/**
 * Empilha as camadas dos módulos ligados.
 *
 * Composição por cima, nunca edição: o `firebase-repository` não é tocado. Cada
 * camada substitui só os métodos do seu módulo, e o que sobra continua vindo do
 * Firestore sem saber que algo mudou.
 *
 * É o que torna o rollback independente: desligar um módulo em
 * `EXPO_PUBLIC_SUPABASE_MODULES` não afeta os outros.
 */

import { ignorarColecoesDoFirestore } from '@/services/repository/colecoes-do-firestore';
import { moduloUsaSupabase, type ModuloMigravel } from '@/services/repository/modulos';
import { comAvaliacoes } from '@/services/repository/supabase/composicao/avaliacoes';
import { comElenco } from '@/services/repository/supabase/composicao/elenco';
import { comFinanceiro } from '@/services/repository/supabase/composicao/financeiro';
import { comNotificacoes } from '@/services/repository/supabase/composicao/notificacoes';
import { comPartidas } from '@/services/repository/supabase/composicao/partidas';
import { comResenhas } from '@/services/repository/supabase/composicao/resenhas';
import {
  aplicarTodasAsFatias,
  fatiasPendentes,
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

/**
 * Coleções do Firestore que cada módulo passa a entregar sozinho.
 *
 * Enquanto isso não existia, o app lia os dois bancos inteiros: o Firestore
 * entregava partida, presença, nota e voto, e a fatia jogava tudo fora e punha
 * o Postgres no lugar. A leitura era paga e o dado, descartado — a mesma carga
 * que motivou a migração, ainda de pé.
 *
 * `users`, `teams` e `teamMembers` ficam de fora de propósito: vêm do bootstrap
 * e são o que segura a tela enquanto o Postgres responde.
 *
 * `seasons` também fica: não tem módulo e não foi migrada.
 */
const COLECOES_POR_MODULO: Record<ModuloMigravel, readonly string[]> = {
  financeiro: [],
  resenhas: ['matchDiaryEntries'],
  partidas: ['matches', 'attendance', 'lineups', 'matchStats'],
  avaliacoes: ['mvpVotes', 'playerRatings', 'ratingCriteria'],
  elenco: ['players'],
  notificacoes: ['notifications'],
};

export function comModulosNoSupabase(base: AppRepository): AppRepository {
  const ligados = CAMADAS.filter((camada) => moduloUsaSupabase(camada.modulo));

  if (ligados.length === 0) {
    return base;
  }

  // O repositório do Firestore não sabe que existe migração — recebe só a lista
  // de coleções que pode deixar de ler.
  ignorarColecoesDoFirestore(
    ligados.flatMap((camada) => COLECOES_POR_MODULO[camada.modulo] ?? []),
  );

  const composto = ligados.reduce<AppRepository>(
    (atual, camada) => camada.aplicar(atual),
    base,
  );

  /**
   * Busca o que falta do Postgres e compõe sobre o snapshot do Firestore.
   *
   * As duas entradas passam por aqui. `getInitialSnapshot` é o bootstrap do app
   * e ficou de fora por descuido: sem ele, toda abertura montava a tela só com
   * o Firestore — dado velho dos módulos migrados, e a leitura da coleção
   * inteira que a migração existe justamente para evitar.
   */
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
      return await comporSobre(() => base.getInitialSnapshot());
    },

    async getSnapshot() {
      return await comporSobre(() => base.getSnapshot());
    },
  };

  if (base.subscribeSnapshot) {
    comSnapshot.subscribeSnapshot = async (currentUserId, handlers) =>
      await base.subscribeSnapshot!(currentUserId, {
        ...handlers,
        onSnapshot: (snapshot) => {
          registrarEmissao(snapshot, handlers.onSnapshot);

          const pendentes = fatiasPendentes();

          if (pendentes.length === 0) {
            handlers.onSnapshot(aplicarTodasAsFatias(snapshot));
            return;
          }

          // Espera a primeira carga do Postgres antes de pintar.
          //
          // Antes dava para emitir na hora porque o Firestore entregava os
          // mesmos dados e servia de rascunho. Agora ele deixou de ler o que o
          // Postgres cobre, então emitir aqui mostraria listas vazias — e tela
          // vazia é indistinguível de "não tem nada", que foi o bug do "você
          // não participa de nenhum time".
          //
          // Não trava: leitura que falha devolve vazio em vez de rejeitar, então
          // a promessa sempre resolve e a tela sempre pinta.
          void Promise.all(pendentes.map((fatia) => fatia.obter())).then(() => {
            handlers.onSnapshot(aplicarTodasAsFatias(snapshot));
          });
        },
      });
  }

  return comSnapshot;
}
