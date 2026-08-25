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

import { moduloUsaSupabase, type ModuloMigravel } from '@/services/repository/modulos';
import { comAvaliacoes } from '@/services/repository/supabase/composicao/avaliacoes';
import { comElenco } from '@/services/repository/supabase/composicao/elenco';
import { comFinanceiro } from '@/services/repository/supabase/composicao/financeiro';
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
];

export function comModulosNoSupabase(base: AppRepository): AppRepository {
  const ligados = CAMADAS.filter((camada) => moduloUsaSupabase(camada.modulo));

  if (ligados.length === 0) {
    return base;
  }

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
          handlers.onSnapshot(aplicarTodasAsFatias(snapshot));

          const pendentes = fatiasPendentes();

          if (pendentes.length > 0) {
            // A primeira emissão sai sem os módulos do Postgres; assim que
            // chegam, o app é avisado de novo. Melhor uma aba aparecer um
            // instante depois do que segurar a tela inteira esperando por ela.
            void Promise.all(pendentes.map((fatia) => fatia.obter())).then(() => {
              handlers.onSnapshot(aplicarTodasAsFatias(snapshot));
            });
          }
        },
      });
  }

  return comSnapshot;
}
