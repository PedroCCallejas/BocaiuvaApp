/**
 * Confere se o Postgres bate com o Firestore antes da virada.
 *
 * Roda depois da importação e antes de ligar a flag em produção. Se qualquer
 * número divergir, sai com erro — e a virada não acontece.
 *
 * A referência é o **dump**, não o Firestore ao vivo: é o mesmo arquivo que
 * alimentou a importação. Comparar contra o Firestore ao vivo acusaria
 * divergência a cada escrita feita entre uma coisa e outra, e a gente
 * perseguiria fantasma.
 *
 * Uso:
 *   npm run migrar:conferir
 *
 * Ambiente: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  DEFINICOES,
  ORDEM_DAS_TABELAS,
  classificarReferenciasDescartadas,
  resolverReferencias,
  type Linha,
  type NomeDaTabela,
} from '@/lib/migracao/mapear-postgres';
import {
  assinaturaDePartida,
  assinaturaDePresenca,
  compararResumos,
  descreverDivergencias,
  partidasParaAmostra,
  resumoVazio,
  type ResumoDaMigracao,
} from '@/lib/migracao/conferir';

const PASTA_PADRAO = path.resolve(process.cwd(), 'dados-firestore');

function log(mensagem: string, dados?: unknown) {
  if (dados === undefined) {
    console.log(`[conferencia] ${mensagem}`);
    return;
  }

  console.log(
    `[conferencia] ${mensagem}`,
    typeof dados === 'string' ? dados : JSON.stringify(dados, null, 2),
  );
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }

  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

function inteiro(valor: unknown): number {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? Math.trunc(numero) : 0;
}

function abrirSupabase(): SupabaseClient {
  const url = textoOuNulo(process.env.SUPABASE_URL);
  const chave = textoOuNulo(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !chave) {
    throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  }

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function carregar(pasta: string, colecao: string): Record<string, unknown>[] {
  const caminho = path.join(pasta, `${colecao}.json`);

  if (!existsSync(caminho)) {
    return [];
  }

  const conteudo = JSON.parse(readFileSync(caminho, 'utf8')) as unknown;
  return Array.isArray(conteudo) ? (conteudo as Record<string, unknown>[]) : [];
}

/**
 * O que a importação deveria ter gravado.
 *
 * Roda o mesmo mapeamento do importador, então "esperado" é literalmente o que
 * ele produz — e não uma segunda interpretação do dump, que poderia divergir e
 * dar alarme falso.
 */
function resumoDoFirestore(pasta: string): ResumoDaMigracao {
  const resumo = resumoVazio();
  const referencia = new Date().toISOString();
  const idsConhecidos: Partial<Record<NomeDaTabela, Set<string>>> = {};
  const aceitasPorTabela = new Map<NomeDaTabela, Linha[]>();
  const filhasPorTabela = new Map<string, Record<string, unknown>[]>();

  for (const tabela of ORDEM_DAS_TABELAS) {
    const definicao = DEFINICOES.find((item) => item.tabela === tabela);

    if (!definicao) {
      continue;
    }

    const documentos = carregar(pasta, definicao.colecao);
    const mapeadas: Linha[] = [];

    for (const documento of documentos) {
      const linha = definicao.mapear(documento, { referencia });

      if (!linha) {
        continue;
      }

      mapeadas.push(linha);

      for (const filha of definicao.filhas ?? []) {
        const atual = filhasPorTabela.get(filha.tabela) ?? [];
        atual.push(...filha.derivar(documento, { referencia }));
        filhasPorTabela.set(filha.tabela, atual);
      }
    }

    const { aceitas } = resolverReferencias(tabela, mapeadas, idsConhecidos);
    idsConhecidos[tabela] = new Set(aceitas.map((linha) => String(linha.id)));
    aceitasPorTabela.set(tabela, aceitas);
    resumo.contagens[tabela] = aceitas.length;
  }

  // Filha só conta se o pai sobreviveu.
  for (const [tabela, linhas] of filhasPorTabela.entries()) {
    const paisAceitos =
      tabela === 'expense_shares' ? idsConhecidos.expenses : idsConhecidos.matches;
    const coluna = tabela === 'expense_shares' ? 'expense_id' : 'match_id';

    const validas = linhas.filter((linha) => {
      const pai = textoOuNulo(linha[coluna]);
      const jogador = textoOuNulo(linha.player_id);
      const jogadores = idsConhecidos.players;

      return (
        pai &&
        paisAceitos?.has(pai) &&
        (!jogador || !jogadores || jogadores.has(jogador))
      );
    });

    resumo.contagens[tabela] = validas.length;

    if (tabela === 'expense_shares') {
      resumo.somas['cotas_de_despesa_cents'] = validas.reduce(
        (total, linha) => total + inteiro(linha.amount_cents),
        0,
      );
    }

    if (tabela === 'match_field_costs') {
      resumo.somas['custo_de_campo_cents'] = validas.reduce(
        (total, linha) => total + inteiro(linha.total_amount_cents),
        0,
      );
    }
  }

  // ── Somas ────────────────────────────────────────────────────────────────
  resumo.somas['despesas_cents'] = (aceitasPorTabela.get('expenses') ?? []).reduce(
    (total, linha) => total + inteiro(linha.total_amount_cents),
    0,
  );

  resumo.somas['gols'] = (aceitasPorTabela.get('match_stats') ?? []).reduce(
    (total, linha) => total + inteiro(linha.goals),
    0,
  );

  resumo.somas['assistencias'] = (aceitasPorTabela.get('match_stats') ?? []).reduce(
    (total, linha) => total + inteiro(linha.assists),
    0,
  );

  // ── Amostras ─────────────────────────────────────────────────────────────
  const partidas = (aceitasPorTabela.get('matches') ?? []).filter(
    (linha) => linha.deleted_at == null,
  );
  const presencas = aceitasPorTabela.get('attendance') ?? [];

  for (const partida of partidasParaAmostra(
    partidas.map((linha) => ({
      id: String(linha.id),
      date: String(linha.date),
      status: String(linha.status),
      opponentName: String(linha.opponent_name ?? ''),
      placar: linha.scoreboard as { team?: number; opponent?: number } | null,
    })),
  )) {
    resumo.amostras[`partida ${partida.id}`] = assinaturaDePartida({
      ...partida,
      team: partida.placar?.team ?? null,
      opponent: partida.placar?.opponent ?? null,
    });

    resumo.amostras[`presenca ${partida.id}`] = assinaturaDePresenca(
      presencas
        .filter((linha) => String(linha.match_id) === partida.id)
        .map((linha) => ({ status: String(linha.status) })),
    );
  }

  return resumo;
}

async function contar(supabase: SupabaseClient, tabela: string): Promise<number> {
  const { count, error } = await supabase
    .from(tabela)
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Falha ao contar ${tabela}: ${error.message}`);
  }

  return count ?? 0;
}

async function somar(
  supabase: SupabaseClient,
  tabela: string,
  coluna: string,
): Promise<number> {
  // Sem agregação no PostgREST sem view: soma no cliente. O volume é pequeno.
  const { data, error } = await supabase.from(tabela).select(coluna);

  if (error) {
    throw new Error(`Falha ao somar ${tabela}.${coluna}: ${error.message}`);
  }

  return ((data ?? []) as unknown[]).reduce<number>(
    (total, linha) => total + inteiro((linha as Record<string, unknown>)[coluna]),
    0,
  );
}

async function resumoDoPostgres(supabase: SupabaseClient): Promise<ResumoDaMigracao> {
  const resumo = resumoVazio();

  for (const tabela of ORDEM_DAS_TABELAS) {
    resumo.contagens[tabela] = await contar(supabase, tabela);
  }

  for (const tabela of ['expense_shares', 'match_field_costs', 'match_field_participants']) {
    resumo.contagens[tabela] = await contar(supabase, tabela);
  }

  resumo.somas['despesas_cents'] = await somar(supabase, 'expenses', 'total_amount_cents');
  resumo.somas['cotas_de_despesa_cents'] = await somar(
    supabase,
    'expense_shares',
    'amount_cents',
  );
  resumo.somas['custo_de_campo_cents'] = await somar(
    supabase,
    'match_field_costs',
    'total_amount_cents',
  );
  resumo.somas['gols'] = await somar(supabase, 'match_stats', 'goals');
  resumo.somas['assistencias'] = await somar(supabase, 'match_stats', 'assists');

  const { data: partidas, error } = await supabase
    .from('matches')
    .select('id, date, status, opponent_name, scoreboard')
    .is('deleted_at', null);

  if (error) {
    throw new Error(`Falha ao ler partidas: ${error.message}`);
  }

  const amostra = partidasParaAmostra(
    (partidas ?? []).map((linha) => {
      const item = linha as Record<string, unknown>;
      return {
        id: String(item.id),
        date: String(item.date),
        status: String(item.status),
        opponentName: String(item.opponent_name ?? ''),
        placar: item.scoreboard as { team?: number; opponent?: number } | null,
      };
    }),
  );

  for (const partida of amostra) {
    resumo.amostras[`partida ${partida.id}`] = assinaturaDePartida({
      ...partida,
      team: partida.placar?.team ?? null,
      opponent: partida.placar?.opponent ?? null,
    });

    const { data: presencas, error: erroDePresenca } = await supabase
      .from('attendance')
      .select('status')
      .eq('match_id', partida.id);

    if (erroDePresenca) {
      throw new Error(`Falha ao ler presenca de ${partida.id}: ${erroDePresenca.message}`);
    }

    resumo.amostras[`presenca ${partida.id}`] = assinaturaDePresenca(
      (presencas ?? []).map((linha) => ({
        status: String((linha as { status?: unknown }).status ?? ''),
      })),
    );
  }

  return resumo;
}

async function main() {
  const pasta = process.argv.includes('--ler-de')
    ? path.resolve(process.argv[process.argv.indexOf('--ler-de') + 1])
    : PASTA_PADRAO;

  if (!existsSync(pasta)) {
    throw new Error(`Dump nao encontrado em ${pasta}. Rode npm run migrar:baixar antes.`);
  }

  log(`comparando o dump em ${pasta} com o Postgres`);

  const doFirestore = resumoDoFirestore(pasta);
  const doPostgres = await resumoDoPostgres(abrirSupabase());
  const divergencias = compararResumos(doFirestore, doPostgres);

  log('contagens', doPostgres.contagens);
  log('somas', doPostgres.somas);

  if (divergencias.length === 0) {
    log(`nenhuma divergencia em ${Object.keys(doFirestore.amostras).length / 2} amostras`);
    log('pode virar.');
    return;
  }

  console.error(`\n[conferencia] ${divergencias.length} divergencia(s):\n`);
  console.error(descreverDivergencias(divergencias));
  console.error('\n[conferencia] NAO vire o banco. Investigue antes.');
  process.exit(1);
}

main().catch((erro) => {
  console.error('[conferencia] falhou', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
