/**
 * Qual módulo já lê do Supabase.
 *
 * A migração é por módulo, não de uma vez. Um interruptor único para o app
 * inteiro obrigaria a trocar tudo junto — e aí, quando algo quebrasse, não
 * haveria como saber o que foi nem como voltar só aquele pedaço.
 *
 * Ligado por variável de ambiente, definida por ambiente na Vercel:
 *
 *   EXPO_PUBLIC_SUPABASE_MODULES=financeiro
 *
 * Produção sem a variável continua 100% no Firestore. O rollback é não ter
 * mexido: nada a desfazer.
 *
 * Atenção: `EXPO_PUBLIC_*` é embutida no bundle durante o build, não lida em
 * tempo de execução. Mudar o valor exige um build novo.
 */

/**
 * Módulos que podem migrar de forma independente, na ordem sugerida.
 *
 * A ordem é por acoplamento, não por importância. `avaliacoes` vem antes de
 * `partidas` porque votos e notas têm um escritor cada; já as estatísticas da
 * partida (`match_stats`) são gravadas dentro do `finishMatch`, junto com a
 * partida e a presença — separá-las obrigaria a escrever em dois bancos numa
 * operação só, sem transação possível entre eles.
 *
 * Por isso `match_stats` migra junto com `partidas`, e não como módulo próprio.
 */
export const MODULOS_MIGRAVEIS = [
  'financeiro',
  'resenhas',
  'avaliacoes',
  'partidas',
  'elenco',
  'notificacoes',
] as const;

export type ModuloMigravel = (typeof MODULOS_MIGRAVEIS)[number];

/**
 * Lê a lista da variável de ambiente.
 *
 * Nome desconhecido é ignorado em vez de derrubar o app: um erro de digitação
 * na Vercel não pode virar tela branca. Em desenvolvimento o aviso aparece no
 * console, que é onde alguém vai olhar.
 */
export function lerModulosHabilitados(
  bruto: string | undefined | null,
  aoIgnorar?: (nome: string) => void,
): ModuloMigravel[] {
  if (!bruto) {
    return [];
  }

  const pedidos = bruto
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const habilitados: ModuloMigravel[] = [];

  for (const pedido of pedidos) {
    if ((MODULOS_MIGRAVEIS as readonly string[]).includes(pedido)) {
      if (!habilitados.includes(pedido as ModuloMigravel)) {
        habilitados.push(pedido as ModuloMigravel);
      }

      continue;
    }

    aoIgnorar?.(pedido);
  }

  return habilitados;
}

const modulosHabilitados = lerModulosHabilitados(
  process.env.EXPO_PUBLIC_SUPABASE_MODULES,
  (nome) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        `[migracao] modulo desconhecido em EXPO_PUBLIC_SUPABASE_MODULES: "${nome}". ` +
          `Validos: ${MODULOS_MIGRAVEIS.join(', ')}.`,
      );
    }
  },
);

export function moduloUsaSupabase(modulo: ModuloMigravel): boolean {
  return modulosHabilitados.includes(modulo);
}

/** Só para diagnóstico e telas de suporte. */
export function listarModulosNoSupabase(): ModuloMigravel[] {
  return [...modulosHabilitados];
}
