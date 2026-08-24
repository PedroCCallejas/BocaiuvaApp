/**
 * Pedaços do snapshot que vêm do Postgres.
 *
 * O app monta a tela a partir de um `AppSnapshot` único. Enquanto a migração
 * acontece, parte dele vem do Firestore (em tempo real) e parte do Postgres.
 * Este arquivo costura os dois.
 *
 * Extraído quando o segundo módulo chegou. No primeiro seria adivinhação: só
 * com dois dá para ver o que é padrão e o que era particularidade do
 * financeiro.
 *
 * Duas regras que valem para qualquer módulo:
 *
 * 1. **Escrita avisa a tela.** O tempo real é do Firestore e ele não sabe que
 *    o Postgres mudou. Quem gravou precisa reemitir — sem isso a tela mostra o
 *    valor antigo e a pessoa acha que o botão não funcionou.
 * 2. **Falha não derruba o app.** Um módulo fora do ar devolve vazio e o resto
 *    da tela continua vindo do Firestore.
 */

import type { AppSnapshot } from '@/services/repository/types';

export interface Fatia<T> {
  /** Valor em cache, buscando na primeira vez. */
  obter: () => Promise<T>;
  /** Relê do banco e avisa a tela. Chamada depois de toda escrita. */
  recarregar: () => Promise<T>;
  /** Aplica o que estiver em cache sobre o snapshot do Firestore. */
  aplicar: (snapshot: AppSnapshot) => AppSnapshot;
  /** Se ainda não buscou nada. */
  estaVazia: () => boolean;
}

/** Último snapshot do Firestore e para onde reemitir. */
let ultimoSnapshotBase: AppSnapshot | null = null;
let emitirParaOApp: ((snapshot: AppSnapshot) => void) | null = null;

const fatiasRegistradas: Fatia<unknown>[] = [];

/** Chamado pelo wrapper de `subscribeSnapshot` a cada emissão do Firestore. */
export function registrarEmissao(
  snapshot: AppSnapshot,
  emitir: (snapshot: AppSnapshot) => void,
) {
  ultimoSnapshotBase = snapshot;
  emitirParaOApp = emitir;
}

/** Compõe todas as fatias sobre um snapshot do Firestore. */
export function aplicarTodasAsFatias(base: AppSnapshot): AppSnapshot {
  return fatiasRegistradas.reduce((atual, fatia) => fatia.aplicar(atual), base);
}

/** Reemite com tudo que está em cache. Sem tempo real ligado, não faz nada. */
function reemitir() {
  if (ultimoSnapshotBase && emitirParaOApp) {
    emitirParaOApp(aplicarTodasAsFatias(ultimoSnapshotBase));
  }
}

/** Fatias que ainda não carregaram — usado para a primeira busca em lote. */
export function fatiasPendentes() {
  return fatiasRegistradas.filter((fatia) => fatia.estaVazia());
}

export function criarFatia<T>(input: {
  /** Aparece no log quando a leitura falha. */
  nome: string;
  ler: () => Promise<T>;
  vazio: T;
  /** Como o valor entra no snapshot. */
  aplicar: (snapshot: AppSnapshot, valor: T) => AppSnapshot;
}): Fatia<T> {
  let cache: T | null = null;
  let leituraEmVoo: Promise<T> | null = null;

  async function lerComSeguranca(): Promise<T> {
    try {
      return await input.ler();
    } catch (erro) {
      // Módulo fora do ar é uma aba sem dado, não uma tela que não abre.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[supabase] ${input.nome} indisponivel`, erro);
      }

      return input.vazio;
    }
  }

  const fatia: Fatia<T> = {
    async obter() {
      if (cache) {
        return cache;
      }

      // Emissões em sequência não podem virar várias requisições iguais.
      leituraEmVoo ??= lerComSeguranca().then((valor) => {
        cache = valor;
        leituraEmVoo = null;
        return valor;
      });

      return await leituraEmVoo;
    },

    async recarregar() {
      leituraEmVoo = null;
      cache = await lerComSeguranca();
      reemitir();
      return cache;
    },

    aplicar(snapshot) {
      return input.aplicar(snapshot, cache ?? input.vazio);
    },

    estaVazia() {
      return cache === null;
    },
  };

  fatiasRegistradas.push(fatia as Fatia<unknown>);
  return fatia;
}

/** Só para teste: devolve o módulo ao estado inicial entre casos. */
export function limparFatias() {
  ultimoSnapshotBase = null;
  emitirParaOApp = null;
  fatiasRegistradas.length = 0;
}
