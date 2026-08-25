/**
 * Comparação Firestore × Postgres antes da virada.
 *
 * Existe para trocar "parece que está tudo certo" por verificação. Sem isto, a
 * decisão de virar o banco seria opinião — e dado perdido numa migração só
 * aparece semanas depois, quando alguém procura um jogo antigo e não acha.
 *
 * A comparação é de três tipos, e cada uma pega uma classe diferente de erro:
 *
 * 1. **Contagem** — linha que não chegou.
 * 2. **Soma de dinheiro** — valor que chegou torto. Contagem igual com soma
 *    diferente é o pior caso: parece certo e não é.
 * 3. **Amostra** — assinatura de registros específicos, para pegar troca de
 *    campo que soma e contagem não enxergam (placar invertido, data deslocada).
 */

export interface Divergencia {
  assunto: string;
  noFirestore: string;
  noPostgres: string;
}

export interface ResumoDaMigracao {
  /** Quantas linhas cada tabela deve ter. */
  contagens: Record<string, number>;
  /** Totais em centavos, por assunto. */
  somas: Record<string, number>;
  /** Assinatura textual de registros escolhidos a dedo. */
  amostras: Record<string, string>;
}

export function resumoVazio(): ResumoDaMigracao {
  return { contagens: {}, somas: {}, amostras: {} };
}

function compararMapas(
  rotulo: string,
  esperado: Record<string, number | string>,
  encontrado: Record<string, number | string>,
): Divergencia[] {
  const divergencias: Divergencia[] = [];

  // Percorre a união das chaves: faltar de um lado também é divergência, e
  // seria invisível se só iterássemos por um dos mapas.
  const chaves = [...new Set([...Object.keys(esperado), ...Object.keys(encontrado)])].sort();

  for (const chave of chaves) {
    const doFirestore = esperado[chave];
    const doPostgres = encontrado[chave];

    if (String(doFirestore ?? '(ausente)') !== String(doPostgres ?? '(ausente)')) {
      divergencias.push({
        assunto: `${rotulo}: ${chave}`,
        noFirestore: String(doFirestore ?? '(ausente)'),
        noPostgres: String(doPostgres ?? '(ausente)'),
      });
    }
  }

  return divergencias;
}

export function compararResumos(
  firestore: ResumoDaMigracao,
  postgres: ResumoDaMigracao,
): Divergencia[] {
  return [
    ...compararMapas('contagem', firestore.contagens, postgres.contagens),
    ...compararMapas('soma', firestore.somas, postgres.somas),
    ...compararMapas('amostra', firestore.amostras, postgres.amostras),
  ];
}

/**
 * Assinatura de uma partida.
 *
 * Junta os campos que a tela mostra. Se qualquer um trocar de lugar na
 * migração — placar invertido, data deslocada por fuso — a string muda e a
 * comparação acusa, coisa que contagem e soma não pegariam.
 */
export function assinaturaDePartida(entrada: {
  id: string;
  date: string;
  status: string;
  opponentName: string;
  team?: number | null;
  opponent?: number | null;
}): string {
  const placar =
    entrada.team == null && entrada.opponent == null
      ? 'sem-placar'
      : `${entrada.team ?? 0}x${entrada.opponent ?? 0}`;

  return [entrada.date, entrada.status, entrada.opponentName, placar].join(' | ');
}

/** Assinatura de presença: quantos confirmaram, faltaram e não responderam. */
export function assinaturaDePresenca(entradas: { status: string }[]): string {
  const contagem = { confirmed: 0, absent: 0, pending: 0 } as Record<string, number>;

  for (const entrada of entradas) {
    if (entrada.status in contagem) {
      contagem[entrada.status] += 1;
    }
  }

  return `c${contagem.confirmed} a${contagem.absent} p${contagem.pending}`;
}

/**
 * As partidas que entram na amostra.
 *
 * As mais recentes, porque são as que o time olha e as que mudaram por último
 * — onde um erro de migração apareceria primeiro.
 */
export function partidasParaAmostra<T extends { id: string; date: string }>(
  partidas: T[],
  quantidade = 5,
): T[] {
  return [...partidas]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id.localeCompare(b.id)))
    .slice(0, quantidade);
}

/** Texto pronto para o terminal. Vazio quando não há divergência. */
export function descreverDivergencias(divergencias: Divergencia[]): string {
  if (divergencias.length === 0) {
    return '';
  }

  return divergencias
    .map(
      (item) =>
        `  ${item.assunto}\n    Firestore: ${item.noFirestore}\n    Postgres:  ${item.noPostgres}`,
    )
    .join('\n');
}
