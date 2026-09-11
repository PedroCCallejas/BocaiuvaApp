/**
 * Fatias do snapshot único da aplicação, todas lidas do Postgres.
 *
 * A primeira carga propaga falhas para não confundir indisponibilidade com
 * “nenhum dado”. Depois que existe cache, uma releitura malsucedida preserva o
 * último estado válido e agenda uma nova tentativa.
 */

import type { AppSnapshot } from '@/services/repository/types';

export interface Fatia<T> {
  /** Valor em cache, buscando na primeira vez. */
  obter: () => Promise<T>;
  /** Relê do banco e avisa a tela. Chamada depois de toda escrita. */
  recarregar: () => Promise<T>;
  /** Aplica o que estiver em cache sobre o snapshot base. */
  aplicar: (snapshot: AppSnapshot) => AppSnapshot;
  /** Se ainda não buscou nada. */
  estaVazia: () => boolean;
}

/** Último snapshot base e para onde reemitir. */
let ultimoSnapshotBase: AppSnapshot | null = null;
let emitirParaOApp: ((snapshot: AppSnapshot) => void) | null = null;

const fatiasRegistradas: Fatia<unknown>[] = [];

/** Registra o último snapshot emitido para atualizações após uma escrita. */
export function registrarEmissao(
  snapshot: AppSnapshot,
  emitir: (snapshot: AppSnapshot) => void,
) {
  ultimoSnapshotBase = snapshot;
  emitirParaOApp = emitir;
}

/** Compõe todas as fatias sobre o snapshot base. */
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

/** Relê todas as partes do snapshot quando a pessoa pede atualização manual. */
export async function recarregarTodasAsFatias() {
  await Promise.all(fatiasRegistradas.map((fatia) => fatia.recarregar()));
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
  let ultimoErro: unknown = null;
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
  async function lerComSeguranca(propagarSemCache = false): Promise<T | null> {
    try {
      const valor = await input.ler();
      ultimaFalha = 0;
      ultimoErro = null;
      tentativasSeguidas = 0;
      return valor;
    } catch (erro) {
      ultimaFalha = Date.now();
      ultimoErro = erro;
      tentativasSeguidas += 1;

      // Módulo fora do ar é uma aba sem dado, não uma tela que não abre.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[supabase] ${input.nome} indisponivel`, erro);
      }

      agendarRetentativa();

      if (propagarSemCache && cache === null) {
        throw erro;
      }

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
        if (cache === null) {
          throw ultimoErro instanceof Error
            ? ultimoErro
            : new Error(`Não foi possível carregar ${input.nome}.`);
        }

        return cache;
      }

      // Emissões em sequência não podem virar várias requisições iguais.
      leituraEmVoo ??= lerComSeguranca(true)
        .then((valor) => {
          if (valor !== null) {
            cache = valor;
          }

          return valor;
        })
        .finally(() => {
          leituraEmVoo = null;
        });

      return (await leituraEmVoo) ?? cache ?? input.vazio;
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
      // A carga inicial aguarda todas as fatias; este fallback evita apagar um
      // snapshot já válido durante uma retentativa posterior.
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
