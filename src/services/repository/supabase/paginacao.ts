/**
 * Ler tabela inteira, sem parar nas primeiras mil linhas.
 *
 * O PostgREST corta toda resposta em 1000 linhas por padrão, e não avisa: não
 * há erro, só vem menos dado. Com `attendance` em 1659 linhas, o ranking passou
 * a somar 60% das presenças — o Alex caiu de 55 para 38 jogos, e todo mundo
 * junto, o que fez parecer regra de negócio errada em vez de leitura truncada.
 *
 * A conta continuava fechando entre si, que é o pior tipo de erro: nada quebra,
 * o número só fica menor.
 *
 * Hoje só `attendance` passa de mil, mas as outras chegam lá com o tempo — cada
 * temporada acrescenta partidas, notas e votos. Por isso a paginação vale para
 * toda leitura de coleção, e não só para a que já estourou.
 */

const TAMANHO_DA_PAGINA = 1000;

/** Teto de segurança: 200 mil linhas. Passou disso, é laço infinito. */
const MAXIMO_DE_PAGINAS = 200;

interface RespostaDoSupabase<T, E> {
  data: T[] | null;
  error: E | null;
}

/**
 * Percorre a consulta em páginas e devolve tudo junto.
 *
 * A consulta recebe o intervalo e **precisa** ter ordenação estável — sem
 * `order`, o Postgres não garante a mesma ordem entre as páginas, e a mesma
 * linha pode vir duas vezes enquanto outra nunca aparece.
 *
 * Devolve no formato do próprio Supabase para o chamador não mudar de forma: o
 * tratamento de erro continua sendo o mesmo `if (resposta.error)`.
 */
export async function todasAsLinhas<T, E>(
  consulta: (de: number, ate: number) => PromiseLike<RespostaDoSupabase<T, E>>,
): Promise<RespostaDoSupabase<T, E>> {
  const todas: T[] = [];

  for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS; pagina += 1) {
    const de = pagina * TAMANHO_DA_PAGINA;
    const { data, error } = await consulta(de, de + TAMANHO_DA_PAGINA - 1);

    if (error) {
      return { data: null, error };
    }

    const lote = data ?? [];
    todas.push(...lote);

    // Página incompleta é o fim. Pedir a próxima só para ver se vem vazia
    // custaria uma ida ao servidor em toda leitura.
    if (lote.length < TAMANHO_DA_PAGINA) {
      return { data: todas, error: null };
    }
  }

  // Chegou aqui com dado demais para ser real: melhor devolver o que tem do que
  // girar para sempre.
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[supabase] leitura passou de ${MAXIMO_DE_PAGINAS} paginas`);
  }

  return { data: todas, error: null };
}
