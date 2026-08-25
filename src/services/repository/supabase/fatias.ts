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
  let leituraEmVoo: Promise<T | null> | null = null;
  let ultimaFalha = 0;
  let tentativasSeguidas = 0;
  let retentativaAgendada = false;

  /** Espera entre tentativas depois de uma falha, para não martelar o servidor. */
  const PAUSA_APOS_FALHA = 5000;

  /**
   * Quantas vezes tentar sozinho depois de falhar.
   *
   * Sem isso a tela ficava parada em zero até alguém recarregar a página: a
   * falha marcava a pausa, a emissão seguinte via a pausa e devolvia vazio, e
   * nada mais acontecia. Uma queda de rede de dois segundos virava "o time não
   * tem nenhum jogo" até o fim da sessão.
   */
  const MAXIMO_DE_RETENTATIVAS = 4;

  /**
   * Lê e devolve `null` quando falha.
   *
   * Devolver o valor vazio faria a falha virar cache — e a partir daí a tela
   * mostraria listas vazias como se fossem a verdade. Com `null`, o que veio do
   * Firestore continua valendo e a próxima emissão tenta de novo.
   */
  async function lerComSeguranca(): Promise<T | null> {
    try {
      const valor = await input.ler();
      ultimaFalha = 0;
      tentativasSeguidas = 0;
      return valor;
    } catch (erro) {
      ultimaFalha = Date.now();
      tentativasSeguidas += 1;

      // Módulo fora do ar é uma aba sem dado, não uma tela que não abre.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[supabase] ${input.nome} indisponivel`, erro);
      }

      agendarRetentativa();
      return null;
    }
  }

  /**
   * Tenta de novo sozinho e reemite quando conseguir.
   *
   * A tela não tem como pedir: sem nova emissão do Firestore, ninguém chama a
   * fatia outra vez. Quem falhou precisa voltar por conta própria.
   */
  function agendarRetentativa() {
    if (retentativaAgendada || tentativasSeguidas >= MAXIMO_DE_RETENTATIVAS) {
      return;
    }

    retentativaAgendada = true;

    setTimeout(() => {
      retentativaAgendada = false;

      if (cache === null) {
        void fatia.recarregar();
      }
    }, PAUSA_APOS_FALHA);
  }

  const fatia: Fatia<T> = {
    async obter() {
      if (cache) {
        return cache;
      }

      if (Date.now() - ultimaFalha < PAUSA_APOS_FALHA) {
        return input.vazio;
      }

      // Emissões em sequência não podem virar várias requisições iguais.
      leituraEmVoo ??= lerComSeguranca().then((valor) => {
        if (valor !== null) {
          cache = valor;
        }

        leituraEmVoo = null;
        return valor;
      });

      return (await leituraEmVoo) ?? input.vazio;
    },

    async recarregar() {
      leituraEmVoo = null;
      const valor = await lerComSeguranca();

      // Falha na releitura mantém o que já estava em cache. Zerar aqui faria a
      // tela esvaziar logo depois de uma escrita que deu certo — exatamente o
      // momento em que a pessoa está olhando para confirmar que funcionou.
      if (valor !== null) {
        cache = valor;
      }

      reemitir();
      return cache ?? input.vazio;
    },

    aplicar(snapshot) {
      // Fatia que ainda não carregou NÃO sobrescreve nada.
      //
      // Usar o valor vazio aqui apagava dado real na primeira pintura: o
      // snapshot do Firestore chegava completo, a fatia zerava `teamMembers`, e
      // o app concluía que a pessoa não participa de nenhum time — mandando o
      // admin do Bocaiúva para a tela de "entrar com código".
      //
      // Enquanto não carrega, o que veio do Firestore continua valendo. Ele
      // ainda tem tudo, e é melhor mostrar dado de um segundo atrás do que
      // mostrar vazio e navegar para o lugar errado.
      return cache === null ? snapshot : input.aplicar(snapshot, cache);
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
